# 性能问题分析

> 仅列出问题，不含解决方案。当前实测内存（空闲态）：

| 容器 | 内存 | 占比 |
|------|------|------|
| jm_django_web (gunicorn ×6) | 258.9 MiB | 3.32% |
| jm_celery_worker | 95.3 MiB | 1.22% |
| jm_celery_beat | 95.9 MiB | 1.23% |
| jm_nginx | 19.0 MiB | 0.24% |
| jm_redis | 5.8 MiB | 0.07% |
| **合计** | **~475 MiB** | — |

系统总 RAM 7.6 GiB，空闲即占 6.2%。下载任务运行时 worker 内存还会飙升。

---

## 1. 下载 / 爬虫管道

### 1.1 图片反混淆解码是纯 Python CPU 瓶颈

- `jmcomic` 库的 `JmImageResp.transfer_to()` 内部做像素级 scramble 解码（Pillow `Image` 操作）。
- 每张图片解码耗时约 50-200ms（取决于分辨率），30 并发时 CPU 密集。
- 该操作通过 `sync_to_async(thread_sensitive=True)` 桥接，全部落到**同一个线程**串行执行，实际并发为 1。
- Python GIL 进一步限制：即使多线程，CPU 密集的 Pillow 解码也无法真正并行。

### 1.2 `thread_sensitive=True` 造成全局串行化

- `tasks.py` 中所有 ORM 操作（`save_album_meta`、`get_or_create_photo`、`mark_photo_downloaded` 等）均标记 `thread_sensitive=True`。
- 含义：所有 sync_to_async 调用被调度到**主线程**（single-thread executor）。
- 当 3 个章节并发下载时，它们的 DB 写入 + 图片解码 + 文件写入全部排队等同一线程。
- 实际吞吐远低于配置的 `JM_DOWNLOAD_PHOTO_CONCURRENCY=3` × `JM_DOWNLOAD_IMAGE_CONCURRENCY=30`。

### 1.3 每个任务创建独立事件循环 + 独立客户端

- `crawl_jm_task` 入口调用 `asyncio.run()`，每次创建全新事件循环。
- `async_jm_client()` 每次新建 HTTP 客户端（TCP 连接 + TLS 握手）。
- 同一本子的多章节下载复用同一 client（OK），但跨任务无连接复用。
- 如果用户连续提交多个任务，每个任务都要重新建立连接。

### 1.4 搜索/查询请求无连接复用

- `jm_sync.py` 中每次 `fetch_album_detail` / `search_site` 都 `async with async_jm_client()`。
- 即每次 API 请求（S1 搜索、S2 详情、S3 章节列表、S4 在线阅读）都新建客户端。
- TLS 握手 + 连接建立开销约 200-500ms/次，对延迟敏感的搜索接口影响明显。

### 1.5 进度上报频率过高

- 每完成一个章节就调用 `task.update_state()`（写 Redis）。
- 对于 50+ 章节的本子，产生 50+ 次 Redis 写入。
- `update_state` 本身是同步方法，经 `sync_to_async` 桥接，也占用主线程时间片。

### 1.6 无下载完整性校验 / 重试粒度粗

- 单张图片下载失败仅 `logger.warning`，不重试。
- 章节级：`_download_photo` 整体 try-except，任何异常标记整章失败。
- 没有 checksum 校验，CDN 返回损坏数据时静默写入磁盘。
- 断点续传粒度为"章节"——章节内 29/30 张成功、1 张失败，下次仍跳过整章（`is_downloaded=True`）。

### 1.7 jmcomic 库本身的限制

- 纯 Python 实现，HTTP 请求基于 httpx/aiohttp，解码基于 Pillow。
- 无原生异步文件 I/O（写磁盘是同步的）。
- 库内部有自己的重试逻辑（`retry_times: 5`），与外层 Celery 重试叠加可能产生长尾延迟。
- 无法控制底层连接池大小、HTTP/2 多路复用等高级特性。

---

## 2. 服务架构 / 内存占用

### 2.1 五容器架构对单用户场景过重

- 当前为单用户/少用户本地部署，却运行 5 个容器。
- `celery_worker` 和 `celery_beat` 各自加载完整 Django 运行时（~95 MiB/个）。
- `celery_beat` 仅做定时调度（每 5 分钟触发一次扫描），空闲时占 95 MiB 纯浪费。
- Gunicorn 6 workers 对单用户并发完全过剩（每 worker ~43 MiB）。

### 2.2 Celery 作为任务队列的开销

- Celery 本身是重量级框架：broker（Redis）+ result backend（Redis）+ worker 进程。
- 实际只有 2 个任务：`crawl_jm_task`（低频）+ `scan_local_media_task`（5 分钟一次）。
- 为这 2 个任务维护整套 Celery 基础设施（worker 进程常驻、beat 进程常驻、Redis 双 DB）。
- Worker 使用 `--pool=threads`，Python GIL 下线程池对 CPU 密集任务无实际并行收益。

### 2.3 Redis 承担过多角色

- 同一个 Redis 实例（DB 0）同时作为：Celery Broker + Celery Result Backend + Django Cache + Session Store。
- 缓存过期策略混杂：搜索结果 120s、本地媒体永不过期（`timeout=None`）、Session 7 天。
- 无内存上限配置（`maxmemory`），长期运行 + 大量 `timeout=None` 键可能无限增长。
- `cache.delete_pattern("jmw-search-*")` 依赖 `django-redis` 的 KEYS 命令，O(N) 扫描。

### 2.4 Gunicorn 同步 worker 模型

- 使用默认 sync worker，每个 worker 同一时刻只处理一个请求。
- 搜索/详情接口调用 jmcomic（网络 I/O 2-5s），期间 worker 完全阻塞。
- 6 个 worker 中只要 6 个并发搜索请求就能耗尽所有 worker，新请求排队。
- 未使用 gevent/eventlet 异步 worker，也未使用 ASGI（uvicorn）。

---

## 3. 数据库（SQLite）

### 3.1 并发写入瓶颈

- SQLite 单写者模型：WAL 模式下仍只允许一个写事务。
- Celery worker 多线程并发写（`mark_photo_downloaded`、`save_album_meta`）+ Web 进程读 = 锁竞争。
- `busy_timeout=5000`：锁等待最长 5 秒，超时抛 `OperationalError`。
- Docker 命名卷（Linux ext4）比绑定挂载好，但 SQLite 在网络文件系统上仍有风险。

### 3.2 无连接池

- SQLite 不支持真正的连接池，`CONN_MAX_AGE=60` 仅复用单连接。
- Gunicorn 6 workers = 6 个独立进程 = 6 个独立 SQLite 连接，写竞争概率 ×6。
- Celery worker 额外 1 个连接，总计 7+ 个进程竞争同一个 SQLite 文件。

### 3.3 ORM 操作未批量优化

- `_save_album_meta_sync`：每次 `update_or_create`（SELECT + INSERT/UPDATE）。
- `_get_or_create_photo_sync`：每个章节单独一次 `get_or_create`，N 个章节 = N 次 DB 往返。
- `_mark_photo_downloaded_sync`：每章完成后单独 `save()`，无 `bulk_update`。
- 对于 100 章节的本子，产生 200+ 次独立 SQL 事务。

---

## 4. 文件系统 I/O

### 4.1 图片写入无缓冲聚合

- 每张图片下载完立即 `transfer_to()`（解码 + 写磁盘），无批量写入。
- 30 并发图片 = 30 次独立文件 open/write/close 系统调用。
- 在 Docker 卷（overlay2）上，每次文件创建涉及 copy-on-write 元数据操作。

### 4.2 本地媒体扫描全量遍历

- `scan_local_media_folders()` 每次执行遍历所有子目录 + 所有文件。
- 对大目录（1000+ 图片），产生大量 `stat()` 系统调用。
- 每 5 分钟由 Celery Beat 触发一次全量扫描，无论文件是否变化。
- 无增量扫描机制（如 inotify / 文件 mtime 比对）。

### 4.3 阅读器图片服务经 Django 中转

- 本地图片通过 nginx `alias` 直接服务（OK）。
- 但视频流通过 Django `StreamingHttpResponse` 中转（`VideoStreamView`）。
- Python 逐 8KB chunk 读取 + yield，占用一个 Gunicorn worker 整个播放期间。
- nginx 本身支持 `mp4` 模块和 `sendfile`，可直接高效服务视频。

---

## 5. 网络 / 缓存层

### 5.1 搜索结果缓存粒度粗

- 缓存键 `jmw-search-{type}-{query}-{page}`，120s TTL。
- 同一关键字不同页码独立缓存，翻页不共享。
- 无预热机制：首次搜索必打远端（2-5s 延迟），用户体验差。

### 5.2 在线详情 / 章节列表无缓存

- `get_album_detail()`（S2）和 `get_episode_list()`（S3）每次请求都打远端。
- 同一本子的详情页和章节列表页分别请求，产生重复网络调用。
- 检测更新（L4 `check_album_updates`）也每次实时请求远端。

### 5.3 封面图片无本地缓存策略

- 搜索结果中每个 album 的 `cover_url` 是远端 CDN 地址。
- 前端每次渲染列表都向 CDN 请求封面图（30 个/页 × 图片请求）。
- 无服务端缩略图生成，原图可能 500KB+，列表加载慢。

---

## 6. 前端相关性能问题

### 6.1 在线阅读器图片加载

- `ComicImage.tsx` 对每张图片创建隐藏 `<img>` + Canvas 解码渲染。
- 大量图片同时挂载时，浏览器并发请求数受限（同域 6 连接）。
- 无虚拟滚动：300 张图片全部挂载 DOM，内存占用高。
- Canvas 反混淆在前端 JS 执行，大图（2000×3000）解码耗时明显。

### 6.2 任务状态轮询

- `CrawlPage.tsx` 提交后定时轮询 `/api/crawl/task/{id}/`。
- 每次轮询 = 一次 HTTP 请求 + Django 视图 + Redis 查询。
- 无 WebSocket/SSE 推送，轮询间隔内进度不实时。

---

## 7. Rust 重写候选分析

> 原则：**保留 jmcomic 库**作为爬虫/下载核心，不自行维护站点协议。
> Rust 仅用于纯计算加速（图片解码）和轻量运行时替代（Celery worker）。

| 组件 | 当前实现 | 适合 Rust 的原因 | 不适合的原因 |
|------|----------|-----------------|-------------|
| 图片反混淆解码（在线阅读） | 前端 JS Canvas | WASM 像素操作 5-20x 加速；无 GC 停顿 | 需 wasm-bindgen 桥接 |
| Celery Worker 替代 | Python Celery（95 MiB 常驻） | Rust 常驻进程 <10 MiB；tokio 原生异步 | 需自行实现任务队列/进度上报 |
| 文件 I/O + 目录扫描 | Python os/pathlib | tokio::fs 异步 I/O；walkdir 增量扫描 | 逻辑简单，Python 也够用 |

**明确不做：**

- ~~替代 jmcomic 库的 HTTP 下载层~~（站点协议维护成本太高，继续用库）
- ~~自行实现域名轮换/API 加密~~（jmcomic 已封装，跟随库更新）

### 7.1 最大收益点：在线阅读 WASM 解码

- 当前在线阅读在前端 JS 做 Canvas 像素重排，大图（2000×3000）耗时明显。
- Rust WASM：`image` crate 像素操作，预期 5-20x 加速。
- 配合虚拟滚动，仅解码视口内图片，内存可控。

### 7.2 次大收益点：替换 Celery 基础设施

- 当前 Celery worker 空闲占 ~112 MiB。
- Rust 轻量任务执行器（tokio + Redis 队列）可 <10 MiB 常驻。
- 内部仍调用 jmcomic 库（通过 Python subprocess）或仅做任务调度。

---

## 8. 其他问题

### 8.1 Docker 镜像体积

- 基础镜像 `python:3.12-slim` + 全部依赖，预估 400-600 MiB。
- Celery worker / beat / web 共用同一镜像，每个容器都包含完整代码 + 依赖。
- 无多阶段构建分离运行时依赖与构建依赖。

### 8.2 日志 I/O

- 每个下载任务产生大量 DEBUG/INFO 日志（每张图片一条）。
- `CompressedTimedRotatingFileHandler` 在轮转时做 gzip 压缩（CPU + I/O 峰值）。
- Celery worker 和 Web 进程同时写日志文件，无结构化日志（JSON），排查效率低。

### 8.3 无资源限制

- Docker Compose 未配置 `mem_limit` / `cpus` 约束。
- 下载任务运行时 worker 内存可能飙升至 1-2 GiB（30 张图片同时在内存中解码）。
- 无 OOM 保护，极端情况可能影响宿主机稳定性。

---
---

# 解决方案（按实施难度递增）

> 分为 4 个阶段。每阶段独立可交付，后阶段依赖前阶段完成。
> 预估收益基于当前 475 MiB 空闲 / 单用户场景。

---

## 阶段 A：配置调优（零代码改动，10 分钟）

### A1. 削减 Gunicorn workers：6 → 2

- 单用户场景 2 workers 足够（1 处理请求 + 1 余量）。
- 节省 ~172 MiB（4 × 43 MiB）。
- 改动：`Dockerfile` CMD `--workers 2`。

### A2. 移除 celery_beat 容器

- 当前唯一定时任务：`scan_local_media_task`（5 分钟一次）。
- 替代：在 `celery_worker` 启动命令中加 `--beat`（Celery 内嵌 beat），或改为 web 容器内 cron。
- 节省 ~96 MiB + 一个容器。
- 改动：`docker-compose.yml` 删除 `celery_beat` 服务；worker command 加 `-B` 参数。

### A3. Redis 内存上限 + 淘汰策略

- 添加 `maxmemory 128mb` + `maxmemory-policy allkeys-lru`。
- 防止 `timeout=None` 键无限增长。
- 改动：`docker-compose.yml` redis command。

**当前 Redis 策略（单实例 DB 0 承担 4 角色）：**

| 角色 | 用途 |
|------|------|
| Django Cache | 搜索结果、本地媒体列表、episode 列表 |
| Session Store | JWT 黑名单 + 用户会话 |
| Celery Broker | 任务队列（LPUSH/BRPOP） |
| Celery Result Backend | 任务状态/进度存储 |

**各键 TTL：**

| 键模式 | TTL | 被驱逐后果 |
|--------|-----|------------|
| `jmw-search-*` | 120s | 无影响（本来就短） |
| `jmw-local-images-*` | 永不过期 | 下次访问触发目录重扫（1-3s），自愈 |
| `jmw-local-videos-*` | 永不过期 | 同上 |
| `jmw-local-media-folders` | 永不过期 | 同上 |
| `jmw-album-episodes-*` | 永不过期 | 检测更新需重新请求远端，自愈 |
| Session 键 | 7 天 | 用户被强制登出（体验差但不致命） |
| Celery 任务结果 | ~1 天 | 已完成任务状态查询返回 PENDING（误报） |

**风险评估：** 当前实际用量 ~6 MiB，128mb 上限下 LRU 驱逐永远不会触发（除非上万 album）。纯兆底保护。

### A4. Docker 资源限制

- web: `mem_limit: 512m`，worker: `mem_limit: 1g`，redis: `mem_limit: 128m`。
- 防止下载任务内存飙升拖垮宿主机。
- 改动：`docker-compose.yml` 各服务加 `deploy.resources.limits`。

### A5. Nginx 直接服务视频（移除 Django 中转）

- 在 `default.conf` 添加 `/media/videos/` location，启用 `sendfile` + `mp4` 模块。
- 删除 `VideoStreamView`（或保留为 fallback）。
- 释放 Gunicorn worker 占用（播放期间不再阻塞）。
- 改动：`nginx/default.conf` + `comic/views.py` + `comic/urls.py`。

### A6. Rust WASM 浏览器端按需图片解码（计划中，暂不开发）

> 仅用于**在线阅读**（搜索页 S4），不替代服务器下载解码。

**场景分离：**

| 场景 | 图片来源 | 谁解码 | 存储形态 |
|------|----------|--------|----------|
| 在线阅读（S4） | JM CDN 实时拉取 | **浏览器 WASM** | 不存储，用完即弃 |
| 下载到本地（C1） | JM CDN → 服务器 | **服务器**（jmcomic 库） | 磁盘存解码后原格式图片 |
| 本子库阅读（L5） | 本地磁盘 | 无需解码 | 已是正常图片（webp/jpg/png） |
| 本地媒体（M3） | 用户自己的文件 | 无需解码 | 本来就是正常图片 |

**在线阅读流程：**

```
用户打开在线阅读器
  → API 返回 [{url: "https://cdn.xxx/00001.webp", num: 3}, ...]
  → 虚拟滚动：仅挂载视口 ±2 屏的 ComicImage（~10 张）
  → 进入视口时：fetch(url) → Worker → WASM 解码 → createImageBitmap → 渲染
  → 滚出视口 → 卸载释放内存
```

**技术要点：**

- Rust crate：`image` + `wasm-bindgen`，编译目标 `wasm32-unknown-unknown`。
- 输入：`(raw_bytes: &[u8], scramble_id: u32, url: &str)` → 输出：解码后 RGBA buffer。
- WASM 模块体积 ~1-3 MB（gzip ~500KB），首次加载后浏览器缓存。
- 并发控制：Worker 内同时解码 2-3 张（2000×3000 RGBA = 24MB/张）。

**收益：**

- 在线阅读无需服务器中转解码，延迟降低。
- 按需渐进式渲染，用户体验优于全量预加载。
- 服务器下载管道不变（继续用 jmcomic 库解码落盘）。

**前置条件：**

- 前端虚拟滚动（C4）完成后效果最佳。
- `scramble_id` + `num` 元数据随图片 URL 一起下发（当前 API 已有）。

**阶段 A 预期收益：空闲内存 475 → ~210 MiB（-56%）**

---

## 阶段 B：Python 代码优化（1-2 天）

### B1. 解除 thread_sensitive 串行化

- 图片解码（`transfer_to`）改为 `thread_sensitive=False`，落入线程池真正并行。
- ORM 操作保持 `thread_sensitive=True`（SQLite 需要），但图片 I/O 不需要。
- 分离：`decode_and_save = sync_to_async(img_resp.transfer_to, thread_sensitive=False)`。
- 预期：图片解码吞吐提升 3-4x（受 CPU 核数限制）。

### B2. 批量 ORM 操作

- `_get_or_create_photo_sync` → 任务开始时一次性 `bulk_create`（`ignore_conflicts=True`）全部章节。
- `_mark_photo_downloaded_sync` → 收集完成的 photo，每 5 章或任务结束时 `bulk_update`。
- 100 章节：200+ 次 SQL → ~5 次。

### B3. jm_sync 连接池复用（单例客户端）

- 模块级维护一个长生命周期异步客户端（进程内复用）。
- 搜索/详情/章节列表共享连接池，省去重复 TLS 握手。
- 注意：Gunicorn 多进程下每进程一个客户端（OK）。
- 预期：搜索接口延迟降低 200-500ms。

### B4. 在线详情 / 章节列表缓存

- `get_album_detail` 结果缓存 300s（键：`jmw-album-detail-{jm_id}`）。
- `get_episode_list` 复用 album_detail 缓存（同一数据源）。
- 检测更新（L4）先读缓存，用户手动刷新时才穿透。

### B5. 进度上报节流

- 改为每 3 秒或每 10% 进度上报一次（取先到达者）。
- 50 章节本子：50 次 Redis 写 → ~10 次。

### B6. 图片下载重试 + 文件级断点续传

- 单张图片失败重试 2 次（指数退避 1s/3s）。
- 章节标记改为：全部图片成功才 `is_downloaded=True`。
- 已存在文件跳过（`os.path.exists` 检查），实现图片级断点续传。

### B7. 本地媒体增量扫描

- 记录目录 mtime，扫描前比对；未变化直接返回缓存。
- 或：仅扫描最近 5 分钟内有修改的目录（`os.stat().st_mtime`）。
- 大目录（1000+ 文件）扫描时间从秒级降到毫秒级。

**阶段 B 预期收益：下载吞吐 ×3-4，搜索延迟 -40%，DB 负载 -90%**

---

## 阶段 C：架构升级（3-5 天）

### C1. 替换 Celery 为内嵌 asyncio 任务管理器

- 在 Django 进程内（或单独轻量进程）运行 asyncio 任务循环。
- 任务提交：写入 Redis List（LPUSH）；Worker：BRPOP 消费。
- 进度上报：Redis Hash（HSET task:{id} progress ...）。
- 状态查询：API 直接 HGETALL。
- 移除 celery + celery_worker 容器，节省 ~96 MiB + 依赖复杂度。
- 保留 Redis 作为轻量队列（已有）。
- 定时扫描：asyncio 内 `loop.call_later` 或简单 cron。

### C2. SSE 实时进度推送（替代轮询）

- Django 视图返回 `text/event-stream`，从 Redis 订阅任务进度。
- 前端 `EventSource` 接收，无需定时轮询。
- 或更简单：Django Channels + WebSocket（已有 ASGI 基础）。
- 减少无效 HTTP 请求，进度实时可见。

### C3. Gunicorn → Uvicorn（ASGI 异步）

- 切换为 ASGI 部署：`uvicorn JmWebProject.asgi:application --workers 2`。
- 搜索/详情等 I/O 密集接口不再阻塞 worker。
- 2 个 uvicorn worker 可处理数百并发连接。
- 配合 C1，Django 进程内即可运行后台任务。

### C4. 前端阅读器虚拟滚动

- 使用 `@tanstack/react-virtual` 或 `react-window`。
- 仅渲染视口内 ±2 屏图片，DOM 节点从 300 → ~10。
- 内存占用降 80%+，滚动流畅度显著提升。

### C5. 封面缩略图服务

- 搜索结果返回时，后端异步下载封面到本地 + Pillow 缩放为 200px 宽缩略图。
- 前端加载本地缩略图（nginx 直接服务），不再打远端 CDN。
- 列表加载从 30 个外部请求 → 30 个本地请求（<5ms/个）。

**阶段 C 预期收益：空闲内存 ~120 MiB（仅 web + redis + nginx），并发能力 ×50+**

---

## 阶段 D：Rust 加速层（1-2 周）

> 原则：保留 jmcomic 库做爬虫/下载，Rust 仅做纯计算加速和轻量运行时。

### D1. 在线阅读 WASM 解码器

- Rust `image` crate + `wasm-bindgen`，编译为 `.wasm`。
- 前端 Web Worker 中运行，替代当前 JS Canvas 解码。
- 仅用于在线阅读（S4），下载/本地阅读不涉及。
- 预期：单图解码 5-20x 加速，无 GC 停顿。

### D2. Rust 任务执行器（替代 Celery Worker，可选）

- tokio 常驻进程，BRPOP 监听 Redis 任务队列。
- 内部仍调用 jmcomic Python 库（subprocess）做实际下载。
- 仅替代 Celery 运行时（调度 + 进度上报），不替代 jmcomic。
- 单进程 <10 MiB RSS，替代 Python Celery worker 112 MiB。
- 进度上报：HSET 写 Redis。

**阶段 D 预期收益：在线阅读解码 ×5-20，worker 内存 -90%**

---

## 实施路线图总览

```
阶段 A（10 min）──→ 阶段 B（1-2 d）──→ 阶段 C（3-5 d）──→ 阶段 D（1-2 w）
配置调优             Python 优化          架构升级            Rust 加速
-50% 内存           ×3 吞吐             -75% 内存           解码 ×20
0 代码改动          纯 Python            进程模型重构         WASM + 轻量 worker
```

| 阶段 | 耗时 | 空闲内存 | 下载吞吐 | 风险 |
|------|------|----------|----------|------|
| 当前 | — | 475 MiB | 1x | — |
| A | 10 min | ~235 MiB | 1x | 极低 |
| B | 1-2 d | ~235 MiB | 3-4x | 低 |
| C | 3-5 d | ~120 MiB | 3-4x | 中（架构变动） |
| D | 1-2 w | <80 MiB | 3-4x（jmcomic 不变） | 中（WASM 新栈） |
