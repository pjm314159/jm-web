# Rust 下载微服务设计

## 1. 目标

用 Rust 常驻微服务**完全替代 Docker 中的 Celery 容器**（celery_worker + Beat）。

功能清单：
- 并发图片下载 + 反混淆解码 + 写盘
- 指数退避重试 + 错误分类
- 任务队列 + 进度回调
- **定时扫描本地媒体目录**（替代 Celery Beat 的 `scan_local_media_task`）

Python 侧仅保留：jmcomic 加密 API 获取元数据 → 组装 URL 列表 → 提交给 Rust。

## 2. jmcomic 图片下载的实际逻辑

### 2.1 CDN 请求（极简）

```python
# jm_client_impl.py L50-51
def get_jm_image(self, img_url) -> JmImageResp:
    return self.get(img_url, is_image=True, headers=JmModuleConfig.new_html_headers())
```

**CDN 只校验 User-Agent + Referer**，无 token/签名：

```python
# jm_config.py L185-204
HTML_HEADERS_TEMPLATE = {
    'accept': 'text/html,application/xhtml+xml,...,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    'referer': 'https://18comic.vip/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/124.0.0.0 Safari/537.36',
    # + sec-ch-ua, sec-fetch-* 等标准浏览器指纹
}
```

### 2.2 反混淆算法（纯计算，~20 行）

```python
# jm_toolkit.py JmImageTool

# 1) 计算切片数 num
def get_num(scramble_id, aid, filename) -> int:
    if aid < scramble_id:       return 0   # 无混淆
    elif aid < 268850:          return 10  # 固定 10 切
    else:
        x = 10 if aid < 421926 else 8
        s = md5(f"{aid}{filename}".encode()).hexdigest()
        return ord(s[-1]) % x * 2 + 2     # 结果范围 [2, 18]

# 2) 纵向切片重排
def decode_and_save(num, img_src, path):
    if num == 0: save(img_src); return
    w, h = img_src.size
    img_decode = Image.new("RGB", (w, h))
    over = h % num
    for i in range(num):
        move = floor(h / num)
        y_src = h - move*(i+1) - over
        y_dst = move*i
        if i == 0: move += over
        else:      y_dst += over
        img_decode.paste(img_src.crop((0, y_src, w, y_src+move)), (0, y_dst))
    img_decode.save(path)
```

> 已在 `frontend/wasm/src/lib.rs` 中用 Rust 实现过（WASM 版），迁移到 native 零成本。

### 2.3 jmcomic 重试机制及其局限

```python
# jm_client_impl.py request_with_retry 递归逻辑：
def request_with_retry(self, request, url, domain_index=0, retry_count=0, ...):
    # 1. domain_index >= len(domain_list) → 抛出 RequestRetryAllFailException
    # 2. 如果 url 以 '/' 开头 → 拼接 domain_list[domain_index] 为完整 URL
    # 3. 发送请求
    # 4. 成功 → 返回
    # 5. 失败 → retry_count < 5 ? 同域名重试 : domain_index+1 切换域名从头来
```

**域名切换对图片下载无效**：

图片 URL 是绝对路径（`https://cdn-msp.18comic.vip/media/photos/438696/00001.webp`），
不以 `/` 开头，所以 `request_with_retry` 不会替换域名。
域名切换仅对 API 路径请求（`/album/xxx`）有效。
图片下载实际只在同一 URL 上重试 5 次，然后直接失败。

**其他问题**：
- **无退避**：失败后立即重试，CDN 压力不减
- **无抖动**：30 张并发图同时失败 → 30 个请求同一瞬间重试（重试风暴）
- **无错误分类**：404 和 503 一视同仁地重试 5 次
- **递归实现**：栈深度 = retry_times × domain_count

### 2.4 元数据 API（不在 Rust 范围）

- `get_album_detail` / `get_photo_detail` 走加密 API
- 需要 `token + tokenparam`（HMAC 签名）+ 响应 AES 解密
- **继续由 Python jmcomic 库处理**

## 3. 重试机制设计

### 3.1 什么是并发重试风暴

```
场景：一个章节 49 张图并发下载，CDN 短暂过载返回 503

jmcomic 的行为（无退避）：
  t=0ms    49 张图同时发出请求
  t=200ms  CDN 返回 503（49 张全部失败）
  t=200ms  49 张立即重试 ← 同一瞬间 49 个请求再次打到 CDN
  t=400ms  CDN 仍然过载 → 503
  t=400ms  49 张再次立即重试 ← 风暴持续
  ...      5 次重试在 ~1s 内耗尽，全部标记失败

问题：
  1. 重试请求与正常请求叠加 → CDN 负载不降反升
  2. 所有客户端同步重试 → 形成周期性流量尖峰（thundering herd）
  3. 重试间隔为 0 → 没有给 CDN 恢复时间
  4. 5 次机会在 1s 内用完 → 相当于没有重试
```

### 3.2 指数退避 + 全抖动（Full Jitter）

```
核心思想：每次重试等待时间翻倍，并加入随机抖动打散同步性。

公式：
  exp_delay = min(base × 2^attempt, cap)
  actual_delay = random(0, exp_delay)     ← "全抖动"

参数：
  base = 200ms     首次退避上限
  cap  = 10_000ms  最大退避上限
  max_retries = 5

退避序列（每次是 [0, exp] 的随机值）：
  attempt 0: exp=200ms   → actual ∈ [0, 200ms)    期望 100ms
  attempt 1: exp=400ms   → actual ∈ [0, 400ms)    期望 200ms
  attempt 2: exp=800ms   → actual ∈ [0, 800ms)    期望 400ms
  attempt 3: exp=1600ms  → actual ∈ [0, 1600ms)   期望 800ms
  attempt 4: exp=3200ms  → actual ∈ [0, 3200ms)   期望 1600ms
  总等待期望: ~3.1s

效果（同样 49 张图同时失败）：
  t=0ms     49 张失败
  t=0~200ms 49 张在 200ms 窗口内随机分散重试 ← 不再同时打 CDN
  如果仍失败：
  t=200~600ms 第二轮在 400ms 窗口内分散 ← 更稀疏
  ...
  CDN 获得喘息时间，大部分请求在第 2-3 次重试时成功
```

### 3.3 为什么用"全抖动"而不是固定退避

```
固定退避（无抖动）：
  49 张图同时失败 → 同时等 200ms → 同时重试 → 仍然同时打 CDN
  只是把风暴从 t=0 推迟到 t=200ms，问题没解决。

全抖动：
  49 张图各自 random(0, 200ms) → 均匀分散在 200ms 窗口内
  CDN 看到的是平滑的低速请求流，而不是周期性尖峰。

参考：AWS Architecture Blog "Exponential Backoff And Jitter" (2015)
```

### 3.4 错误分类

```
┌────────────────────────────────────────────────────────────┐
│                   单张图片下载重试流程                        │
│                                                            │
│  fetch(url)                                                │
│    │                                                       │
│    ├─ 成功(200 + body非空) → 解码 → 写盘 → Done            │
│    │                                                       │
│    ├─ 可重试错误（指数退避后重试）:                           │
│    │   • 网络超时 (connect/read timeout)                    │
│    │   • 连接重置 (connection reset / broken pipe)          │
│    │   • HTTP 429 (Too Many Requests)                      │
│    │   • HTTP 5xx (502/503/504)                            │
│    │   • DNS 解析失败 / TLS 握手失败                        │
│    │   • 空响应体（CDN 偶发）                               │
│    │                                                       │
│    ├─ 特殊处理:                                            │
│    │   • HTTP 429 → 尊重 Retry-After 头（覆盖退避时间）     │
│    │   • HTTP 403 → 换 User-Agent 重试 1 次                │
│    │   • 解码失败 → 重试 1 次（可能是下载不完整）            │
│    │                                                       │
│    ├─ 不可重试（立即标记失败）:                              │
│    │   • HTTP 404 (图片不存在)                              │
│    │   • 解码重试后仍失败                                   │
│    │                                                       │
│    └─ 重试耗尽(5次) → 标记 failed，继续下一张（不中断整章）  │
└────────────────────────────────────────────────────────────┘
```

### 3.5 Rust 实现

```rust
use std::time::Duration;
use reqwest::StatusCode;

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,        // 默认 5
    pub base_delay_ms: u64,      // 默认 200
    pub max_delay_ms: u64,       // 默认 10_000
    pub timeout_secs: u64,       // 单次请求超时，默认 30
}

pub enum RetryError {
    Exhausted { attempts: u32, last_error: String },
    NonRetryable(String),
}

/// 指数退避 + 全抖动
fn backoff_duration(attempt: u32, base_ms: u64, cap_ms: u64) -> Duration {
    let exp_ms = (base_ms * 2u64.pow(attempt)).min(cap_ms);
    let jitter_ms = rand::thread_rng().gen_range(0..exp_ms);
    Duration::from_millis(jitter_ms)
}

async fn fetch_with_retry(
    client: &reqwest::Client,
    url: &str,
    config: &RetryConfig,
) -> Result<bytes::Bytes, RetryError> {
    let mut last_err = String::new();

    for attempt in 0..=config.max_retries {
        if attempt > 0 {
            let delay = backoff_duration(attempt - 1, config.base_delay_ms, config.max_delay_ms);
            tokio::time::sleep(delay).await;
        }

        match client.get(url).send().await {
            Ok(resp) => {
                let status = resp.status();

                if status == StatusCode::OK {
                    let bytes = resp.bytes().await.map_err(|e| {
                        RetryError::Exhausted { attempts: attempt + 1, last_error: e.to_string() }
                    })?;
                    if bytes.is_empty() {
                        last_err = "empty response body".into();
                        continue; // 空响应 → 可重试
                    }
                    return Ok(bytes);
                }

                if status == StatusCode::NOT_FOUND {
                    return Err(RetryError::NonRetryable(format!("404: {url}")));
                }

                if status == StatusCode::TOO_MANY_REQUESTS {
                    // 尊重 Retry-After，覆盖正常退避
                    let wait = resp.headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(5);
                    tokio::time::sleep(Duration::from_secs(wait)).await;
                    last_err = "429 rate limited".into();
                    continue;
                }

                last_err = format!("HTTP {status}");
            }
            Err(e) => {
                last_err = format!("{e}"); // 超时/连接重置/DNS → 可重试
            }
        }
    }

    Err(RetryError::Exhausted { attempts: config.max_retries + 1, last_error: last_err })
}
```

### 3.6 任务级容错 + 断点续传

```rust
/// 单张图：文件已存在则跳过（断点续传）
async fn download_one(client: &Client, task: &DownloadTask, img: &ImageEntry) -> Result<()> {
    let path = format!("{}/{}", task.save_dir, img.filename);

    if let Ok(meta) = tokio::fs::metadata(&path).await {
        if meta.len() > 0 {
            return Ok(());  // 已下载，跳过
        }
    }

    let bytes = fetch_with_retry(client, &img.url, &task.retry_config).await?;
    let num = calc_scramble_num(task.scramble_id, task.aid, &img.filename);
    descramble_and_save(&bytes, num, &path)?;
    Ok(())
}

/// 章节级：单张失败不中断整章
async fn download_chapter(client: &Client, task: &DownloadTask) -> ChapterResult {
    let results = futures::stream::iter(&task.images)
        .map(|img| download_one(client, task, img))
        .buffer_unordered(task.concurrency)  // Semaphore 限流
        .collect::<Vec<_>>()
        .await;

    let success = results.iter().filter(|r| r.is_ok()).count();
    let failed = /* 收集失败文件名 */;
    ChapterResult { success, failed, total: task.images.len() }
}
```

## 4. 微服务架构

### 4.1 系统拓扑

```
┌─────────────────────────────────────────────────────────┐
│  Docker Compose                                         │
│                                                         │
│  ┌─────────┐   ┌─────────────┐   ┌──────────────────┐  │
│  │  Redis  │   │  Django Web │   │  Rust Downloader │  │
│  │         │◄──│  (Gunicorn) │──►│  (常驻微服务)     │  │
│  └─────────┘   └─────────────┘   └──────────────────┘  │
│       ▲              │                    │             │
│       │              │ jmcomic API        │ HTTP GET    │
│       │              ▼                    ▼             │
│       │        ┌──────────┐        ┌──────────┐        │
│       │        │ JM 加密  │        │ JM CDN   │        │
│       │        │ API 服务 │        │ 图片服务 │        │
│       │        └──────────┘        └──────────┘        │
│       │                                                 │
│  ┌────┴────┐                                            │
│  │  Nginx  │  ← 静态文件 + 反代                         │
│  └─────────┘                                            │
└─────────────────────────────────────────────────────────┘
```

| 组件 | 职责 |
|------|------|
| Django Web | 用户请求、jmcomic API 元数据、ORM、缓存、接收进度回调 |
| **Rust Downloader** | 并发下载、反混淆、写盘、重试、任务队列、进度回调、**定时扫描** |
| Redis | 缓存 + Session（不再需要 Broker） |
| Nginx | 反代 + 静态/媒体文件 |

> Celery 完全移除：不再需要 Broker、Beat、Worker。

### 4.2 API 设计

```
# 提交下载任务
POST /api/v1/download
{
  "task_id": "uuid-xxx",
  "save_dir": "/app/media/images/jmcomic/本子名/章节名",
  "scramble_id": "220980",
  "aid": "438696",
  "concurrency": 30,
  "images": [
    { "url": "https://cdn-msp.18comic.vip/media/photos/438696/00001.webp", "filename": "00001.webp" },
    { "url": "https://cdn-msp.18comic.vip/media/photos/438696/00002.webp", "filename": "00002.webp" }
  ],
  "callback_url": "http://web:8000/api/internal/download-progress/"
}

→ 202 Accepted
{ "status": "queued", "position": 1 }
```

```
# 进度回调（Rust → Django，节流：每 3s 或每 10% 上报一次）
POST {callback_url}
{
  "task_id": "uuid-xxx",
  "done": 15,
  "total": 49,
  "failed": [],
  "status": "downloading"   // downloading | completed | failed
}
```

```
# 查询任务状态（备用）
GET /api/v1/download/{task_id}/status
→ { "status": "downloading", "done": 30, "total": 49, "failed": ["00023.webp"] }
```

```
# 健康检查
GET /health
→ 200 { "status": "ok", "active_tasks": 2, "uptime_secs": 86400 }
```

### 4.3 定时扫描（替代 Celery Beat）

当前 Celery Beat 每分钟执行 `scan_local_media_task`，扫描本地媒体目录并更新 Redis 缓存。

Rust 微服务内置定时器：

```rust
use tokio_cron_scheduler::{Job, JobScheduler};

async fn start_scheduler(redis_url: &str, media_root: &str) {
    let sched = JobScheduler::new().await.unwrap();

    // 每分钟扫描本地媒体目录
    sched.add(Job::new_async("0 * * * * *", move |_uuid, _lock| {
        let media_root = media_root.to_string();
        let redis_url = redis_url.to_string();
        Box::pin(async move {
            scan_local_media(&media_root, &redis_url).await;
        })
    }).await.unwrap());

    sched.start().await.unwrap();
}

/// 扫描逻辑：遍历 media/images/local + media/videos 目录
/// 生成文件夹列表 → SET 到 Redis（jmw-local-media-folders）
/// 增量检测：记录目录 mtime，未变化跳过
async fn scan_local_media(media_root: &str, redis_url: &str) {
    // 与当前 Python scan_local_media_folders() 逻辑一致
    // 输出: Redis key "jmw-local-media-folders" → JSON 文件夹列表
}
```

### 4.4 全局并发控制

```rust
/// 跨任务共享的连接池 + Semaphore
/// 多个下载任务同时进行，总并发不超过 MAX_CONCURRENCY
struct AppState {
    client: reqwest::Client,           // 全局热连接池（跨任务复用 TCP/TLS）
    semaphore: Arc<Semaphore>,         // 全局并发上限（默认 50）
    tasks: DashMap<String, TaskState>, // 任务状态表
}
```

## 5. Docker 集成

```yaml
# docker-compose.yml 变更：
# 移除 celery_worker 容器
# 新增：
  rust_downloader:
    build:
      context: ./rust-downloader
      dockerfile: Dockerfile
    image: pjm314159/jm-downloader:latest
    container_name: jm_rust_downloader
    volumes:
      - ./JmWebProject/media:/app/media
    environment:
      - LISTEN_ADDR=0.0.0.0:3080
      - REDIS_URL=redis://redis:6379/0
      - MEDIA_ROOT=/app/media
      - MAX_CONCURRENCY=50
      - RETRY_TIMES=5
      - SCAN_INTERVAL_SECS=60
    depends_on:
      - redis
    restart: unless-stopped
    mem_limit: 64m
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3080/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

## 6. 项目结构

```
rust-downloader/
├── Cargo.toml
├── Dockerfile
└── src/
    ├── main.rs          # axum 路由 + 启动 + scheduler
    ├── config.rs        # 环境变量配置
    ├── download.rs      # 核心下载 + 反混淆 + 断点续传
    ├── retry.rs         # 重试策略（指数退避 + 全抖动 + 错误分类）
    ├── task.rs          # 任务队列 + 状态管理 + 全局 Semaphore
    ├── callback.rs      # 进度回调 Django（节流）
    └── scanner.rs       # 定时扫描本地媒体目录 → Redis
```

## 7. 实施路径

```
Phase 1（MVP，3 天）:
  ├── axum HTTP 微服务骨架 + 健康检查
  ├── 核心下载: 并发 GET + 反混淆 + 写盘
  ├── 重试: 指数退避 + 全抖动 + 错误分类 + 429 Retry-After
  ├── 进度回调: POST callback_url（节流 3s/10%）
  └── Dockerfile: multi-stage build → 最终镜像 ~10MB

Phase 2（集成，2 天）:
  ├── Django tasks.py → HTTP 调用 Rust（替代 jm_async.download_photo_images）
  ├── Django internal API 接收进度回调 → 更新 Redis
  ├── docker-compose: 移除 celery_worker，新增 rust_downloader
  └── 移除 Celery 依赖（celery.py、Beat、shared_task）

Phase 3（增强，1-2 天）:
  ├── 定时扫描: tokio-cron-scheduler 替代 Celery Beat
  ├── 全局并发池: 跨任务 Semaphore
  ├── 任务优先级: 单章 > 整本
  └── 断点续传增强: 内存缓存已完成集合
```

## 8. 预期收益

| 指标 | Celery (当前) | Rust 微服务 |
|------|--------------|-------------|
| 容器内存 | ~400-600MB | **~15-30MB** |
| Docker 总内存 | ~1.7GB (4容器) | ~700MB |
| 单章 49 图 | ~8-12s | ~2-4s |
| 连接复用 | 每任务新建 | 全局热池跨任务 |
| 重试质量 | 无退避/无抖动/重试风暴 | 指数退避+全抖动+429感知 |
| 启动时间 | ~5s | <100ms |
| 定时任务 | 需 Celery Beat | 内置 scheduler |
| 架构复杂度 | Broker+Beat+Worker | 单二进制 |
