# Rust 下载微服务内存优化方案

> 目标：在 64MB 容器限制下稳定运行多任务下载队列，消除 OOM。

## 1. 当前架构内存模型

### 1.1 关键路径

```
Django 提交任务 → tokio::spawn(execute_download)
  → download_chapter(buffer_unordered=30)
    → download_one × N
      → semaphore.acquire()          ← 获取 permit
      → fetch_with_retry()           ← 网络下载（~0.5MB）
      → descramble_and_save()        ← CPU 反混淆（~27MB 峰值）
      → semaphore 释放               ← 函数返回时
```

### 1.2 单张图片内存峰值（1080×1920 webp）

| 阶段 | 分配物 | 大小 |
|------|--------|------|
| 网络响应 | `bytes::Bytes`（压缩原图） | ~0.5 MB |
| 解码 | `image::load_from_memory` → `DynamicImage` | **8.3 MB** |
| 转换 | `img.to_rgba8()` → 新 `RgbaImage`（clone） | **8.3 MB** |
| 输出 | `vec![0u8; w*h*4]` → output 缓冲 | **8.3 MB** |
| 编码 | `out_img.save()` 内部编码缓冲 | ~2 MB |
| **合计峰值** | 以上同时存活 | **~27 MB** |

### 1.3 并发放大

- 全局 Semaphore = 50 permits，覆盖 **下载+反混淆+写盘** 全程
- 最坏情况：50 张图同时处于 descramble 阶段
- 理论峰值：`50 × 27 MB = 1,350 MB` → **超出 64MB 限制 21 倍**
- 实际 3 张同时反混淆即 OOM：`3 × 27 = 81 MB`

### 1.4 基线开销（空闲时）

| 来源 | 估算 |
|------|------|
| tokio runtime（单线程 epoll + 任务栈） | ~3 MB |
| reqwest 连接池（50 idle/host，TLS 会话） | ~5 MB |
| DashMap + TaskState | < 1 MB |
| 二进制 .text/.rodata | ~2 MB |
| **合计** | **~10 MB** |

---

## 2. 瓶颈清单

| # | 问题 | 严重度 | 位置 | 说明 |
|---|------|--------|------|------|
| B1 | Semaphore 覆盖范围过大 | 🔴 致命 | `download_one` L102 | 网络+CPU+IO 全包含，50 permits 可同时 decode |
| B2 | `to_rgba8()` 冗余拷贝 | 🟠 高 | `descramble_and_save` L57 | DynamicImage 已是 RGBA，clone 浪费 8.3MB |
| B3 | output 与 rgba 同时存活 | 🟠 高 | L58-66 | 无法提前释放 source |
| B4 | 无内存反压机制 | 🟠 高 | 架构层 | 不感知图片尺寸，盲目并发 |
| B5 | `send_progress` 每次新建 Client | 🟡 中 | `callback.rs` L13 | 频繁 TLS 握手 + 内存碎片 |
| B6 | `pool_max_idle_per_host(50)` 过大 | 🟡 中 | `task.rs` L90 | 空闲连接占 TLS 缓冲 |

---

## 3. 优化方案

### P0：分离网络信号量与反混淆信号量（效果最大）

**原理**：网络下载是 IO-bound（内存小），反混淆是 CPU-bound（内存大）。两者不应共享同一并发限制。

**改动**：

```rust
// AppState 新增
pub decode_semaphore: Arc<Semaphore>,  // 容量 = 2（可配置）

// download_one 内部
async fn download_one(...) {
    // 阶段1：网络下载（受 net_semaphore 限制，容量 50）
    let bytes = {
        let _net_permit = net_semaphore.acquire().await?;
        fetch_with_retry(client, &img.url, retry_config).await?
    }; // ← net_permit 在此释放

    // 阶段2：反混淆+写盘（受 decode_semaphore 限制，容量 2）
    let _decode_permit = decode_semaphore.acquire().await?;
    descramble_and_save(&bytes, num, &path)?;
}
```

**效果**：最多 2 张图同时反混淆 → 峰值 `2 × 27 = 54 MB`

**新增配置项**：

```toml
[download]
decode_concurrency = 10   # 同时反混淆的最大图片数（0 = 不限制）
```

对应环境变量：`DECODE_CONCURRENCY`

---

### P1：消除 `to_rgba8()` 冗余拷贝（一行改动）

**原理**：`image::load_from_memory` 对 webp/png/jpeg 解码后内部已是 RGBA 表示。`to_rgba8()` 会 clone 整块像素数据；`into_rgba8()` 消耗 DynamicImage 零拷贝转换。

**改动**：

```rust
// 当前（clone，+8.3MB）：
let rgba = img.to_rgba8();

// 优化（move，0 额外分配）：
let rgba = img.into_rgba8();
```

**效果**：单张峰值从 27 MB 降至 **~19 MB**

---

### P2：output 缓冲复用（可选，算法改动）

**背景**：当前 `descramble_and_save` 中，`rgba`（8.3MB）和 `output`（8.3MB）同时存活，峰值 16.6MB。若能在反混淆时复用 `rgba` 的内存，可再省一份缓冲。

---

#### 方案 A：原地行重排（in-place row shuffle）

反混淆本质是行块置换（permutation），可用 O(1) 额外空间的原地置换算法。

**算法思路**（cycle-following permutation）：

```
对于每个行块 i（共 n 个）：
  目标位置 target(i) = 反混淆后该行块应在的位置
  若 target(i) != i，则开始一个循环：
    缓冲当前行块（仅 w×4 bytes ≈ 4KB）
    沿 target 链逐步交换，直到回到起点
```

**关键数据结构**：仅需一行缓冲 `row_buf: Vec<u8>`（大小 = `w × 4` ≈ 4KB）。

**伪代码**：

```rust
let mut visited = vec![false; n]; // n 通常 <= 20，可忽略
let mut row_buf = vec![0u8; w * 4]; // 一行像素，~4KB

for start in 0..n {
    if visited[start] || target(start) == start {
        visited[start] = true;
        continue;
    }
    // 沿循环交换行块
    let mut current = start;
    // 将 current 行块备份到 row_buf
    copy_row_to_buf(&mut data, current, &mut row_buf, w);
    loop {
        let next = target(current);
        if next == start { break; }
        // 将 next 行块移动到 current 位置
        copy_row_block(&mut data, next, current, w);
        visited[next] = true;
        current = next;
    }
    // 将备份的 start 行块写入 final position
    copy_buf_to_row(&mut data, current, &row_buf, w);
    visited[current] = true;
}
```

**内存分析**：
- `data`（来自 `rgba.into_raw()`）：8.3 MB（原地修改，无额外分配）
- `row_buf`：~4 KB
- `visited`：~20 bytes
- **单张峰值：~8.3 MB**（仅 rgba 本身，无 output 副本）

**风险**：算法正确性需严格测试，尤其是循环长度 > 1 的边界情况。

---

#### 方案 B：先 drop DynamicImage，再分配 output（保守优化）

```rust
let rgba = img.into_rgba8();
let raw = rgba.into_raw();  // 获取 Vec<u8>，消耗 RgbaImage
let mut output = vec![0u8; raw.len()];  // 此时 rgba 已 drop
// ... 重排 ...
```

**内存分析**：
- `raw`（8.3MB）和 `output`（8.3MB）同时存活 → 16.6 MB
- 比当前（rgba + output = 16.6MB，但 P1 后仅 output = 8.3MB）少一份 DynamicImage
- 实际上 P1 已消除 `to_rgba8()` 拷贝，方案 B 与 P1 效果重叠

**结论**：方案 B 在 P1 基础上无额外收益，不推荐。

---

**效果汇总**：

| 方案 | 单张反混淆峰值 | 代码量 | 风险 |
|------|----------------|--------|------|
| 当前（P1 后） | ~19 MB | — | — |
| P2 方案 A（原地） | **~8.3 MB** | ~40 行 | 中（算法正确性） |
| P2 方案 B（保守） | ~16.6 MB | ~5 行 | 低（但与 P1 重叠） |

**建议**：P0+P1+P3 已足够 64MB 场景（峰值 ~50MB）。若需进一步压缩至 28MB，可实施 P2 方案 A。

---

### P3：共享 callback Client

**改动**：

```rust
// callback.rs
pub async fn send_progress(
    client: &reqwest::Client,  // ← 复用全局 client
    callback_url: &str,
    ...
)

// task.rs 调用处
send_progress(&state.client, url, ...).await;
```

**效果**：消除每次回调的 Client 创建开销（~0.5 MB/次 + TLS 握手延迟）

---

### P4：缩小连接池

**改动**：

```rust
// 当前
.pool_max_idle_per_host(config.max_concurrency)  // 50

// 优化：与 decode_concurrency 对齐
.pool_max_idle_per_host(config.decode_concurrency + 5)  // 7
```

**效果**：减少 ~3 MB 空闲 TLS 缓冲

---

### P5：内存感知反压（高级，可选）

在 `decode_semaphore.acquire()` 前增加尺寸预估：

```rust
// 根据 Content-Length 或历史均值预估解码后大小
// 若当前活跃 decode 缓冲总量 > 阈值（如 40MB），等待
```

实现复杂度高，P0+P1 已足够 64MB 场景，暂不实施。

---

## 4. 优化后预期内存

| 场景 | 当前 | P0+P1+P3+P4 后 |
|------|------|----------------|
| 空闲 | ~10 MB | ~6 MB |
| 50 张并发下载中（网络阶段） | 50×0.5=25 MB | 同 |
| 10 张同时反混淆（默认 decode_concurrency=10） | N/A（当前可达 50 张） | 10×19=190 MB（若内存紧张可调小） |
| **峰值合计** | **>1 GB (OOM)** | **~50 MB** ✅（decode_concurrency=2 时） |
| 若追加 P2 方案 A | — | **~28 MB** ✅✅ |

> 注：`decode_concurrency` 默认 10 适合 128MB+ 容器；64MB 场景建议设为 2。

---

## 5. 实施顺序与风险

| 优先级 | 改动 | 代码量 | 风险 |
|--------|------|--------|------|
| P0 | 拆分 Semaphore | ~20 行 | 低（逻辑不变，仅并发控制） |
| P1 | `into_rgba8()` | 1 行 | 极低（API 等价） |
| P3 | 共享 Client | ~5 行 | 极低 |
| P4 | 缩小 pool | 1 行 | 极低 |
| P2 | 原地反混淆 | ~40 行 | 中（算法正确性需测试） |

建议：P0 → P1 → P3 → P4 一次性实施，P2 作为后续优化。

---

## 6. 新增配置项

```toml
[download]
# 现有
max_concurrency = 50        # 网络下载并发（Semaphore 容量）
timeout_secs = 30
retry_times = 5
jitter_cap_ms = 2000

# 新增
decode_concurrency = 10     # 反混淆最大并发（内存敏感，0 = 不限制）
```

对应环境变量：`DECODE_CONCURRENCY`

| 容器内存 | 建议 decode_concurrency | 峰值估算 |
|----------|------------------------|----------|
| 64 MB | 2 | ~50 MB |
| 128 MB | 10（默认） | ~200 MB |
| 256 MB+ | 0（不限制） | 受 max_concurrency 约束 |

---

## 7. 验证方法

```bash
# 构建
cargo build --release

# 限制 64MB 运行
docker run --memory=64m --memory-swap=64m jm-rust-downloader

# 压测：同时提交 6 个章节（每章 30+ 张图）
for i in $(seq 1 6); do
  curl -X POST http://localhost:3080/api/v1/download \
    -H 'Content-Type: application/json' \
    -d @test_payload_$i.json
done

# 监控容器内存
docker stats jm_rust_downloader --no-stream
```

成功标准：6 任务并发下载全程 RSS < 60 MB，无 OOM Kill。
