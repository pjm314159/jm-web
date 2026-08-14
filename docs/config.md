# JM-Website 配置规范

> 本文档定义项目所有可配置参数的标准、分层与优先级。

## 配置分层与优先级

```
环境变量（最高） > 配置文件（TOML / .env） > 代码内默认值（最低）
```

| 层级 | 用途 | 示例 |
|------|------|------|
| 环境变量 | Docker / CI / 临时覆盖 | `docker-compose.yml` → `environment` |
| 配置文件 | 用户自定义持久化配置 | `config.toml` / `.env` |
| 代码默认值 | 开箱即用的合理值 | 硬编码 fallback |

---

## 1. Rust 下载微服务（`rust-downloader/config.toml`）

配置文件路径查找顺序（已实现）：
1. 命令行参数 `--config <path>` / `--config=<path>`
2. 环境变量 `JM_CONFIG_FILE` 指定的路径
3. 可执行文件同目录下 `config.toml`
4. 若均不存在 → 使用默认值 + 环境变量覆盖

示例文件：`rust-downloader/config.example.toml`（复制为 `config.toml` 使用）。

### 1.1 `[server]` — 网络与日志

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `listen_addr` | string | `"0.0.0.0:3080"` | `LISTEN_ADDR` | HTTP 监听地址 |
| `log_level` | string | `"info"` | `RUST_LOG` | 日志级别 (trace/debug/info/warn/error) |

### 1.2 `[redis]` — Redis 连接

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `url` | string | `"redis://127.0.0.1:6379/0"` | `REDIS_URL` | Redis 连接串（本地媒体扫描结果写入） |

### 1.3 `[storage]` — 文件存储

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `media_root` | string | `"./media"` | `MEDIA_ROOT` | 媒体文件根目录（与 Django MEDIA_ROOT 一致） |

### 1.4 `[download]` — 下载行为

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `max_concurrency` | uint | `50` | `MAX_CONCURRENCY` | 全局最大并发连接数（Semaphore 容量） |
| `timeout_secs` | uint | `30` | `TIMEOUT_SECS` | 单次 HTTP 请求超时（秒） |
| `retry_times` | uint | `5` | `RETRY_TIMES` | 单张图片最大重试次数 |
| `jitter_cap_ms` | uint | `2000` | `JITTER_CAP_MS` | 全抖动退避上限（毫秒） |
| `decode_concurrency` | uint | `10` | `DECODE_CONCURRENCY` | 反混淆最大并发数（0 = 不限制） |
| `proxy` | string | — | `PROXY` | 图片下载代理地址（不设置/留空则直连；仅图片下载 client 使用） |

> 注意：图片下载另有固定专用超时 600s 与 jmcomic 同款校验头，不受 `timeout_secs` 限制。

### 1.5 `[task]` — 任务管理

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `cleanup_on_failure` | bool | `true` | `CLEANUP_ON_FAILURE` | 任务失败时是否删除已下载的不完整文件 |
| `retention_secs` | uint | `3600` | `TASK_RETENTION_SECS` | 已结束任务在内存中保留时长（秒），超时淘汰 |
| `max_queued` | uint | `200` | `MAX_QUEUED_TASKS` | 最大排队任务数，超限返回 503 |

> 任务队列为进程内存实现（DashMap），Redis 仅用于本地媒体扫描结果，不是消息队列。

### 1.6 `[scanner]` — 定时扫描

| 参数 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `interval_secs` | uint | `60` | `SCAN_INTERVAL_SECS` | 本地媒体目录扫描间隔（秒） |

---

## 2. Django 后端（`.env`）

配置文件：项目根目录 `.env`（由 `docker-compose.yml` 的 `env_file` 加载）。

### 2.1 核心

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `DJANGO_SECRET_KEY` | string | 内置不安全值 | 生产必填 | Session/CSRF/JWT 签名密钥 |
| `REGISTRATION_SECRET_KEY` | string | — | **是** | 注册邀请码，缺失则启动报错 |
| `DJANGO_DEBUG` | bool | `false` | 否 | 调试模式 |
| `ALLOWED_HOST` | string | — | 生产必填 | 允许的主域名（自动附带 127.0.0.1/localhost/web） |
| `DJANGO_SETTINGS_MODULE` | string | `JmWebProject.settings` | 否 | Django 配置模块 |

### 2.2 安全

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `CSRF_TRUSTED_ORIGINS` | csv | `http://127.0.0.1,http://127.0.0.1:8000` | CSRF 信任来源（逗号分隔） |
| `CORS_ALLOWED_ORIGINS` | csv | `http://127.0.0.1,http://127.0.0.1:8000` | CORS 允许来源（逗号分隔） |

### 2.3 服务连接

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `REDIS_URL` | string | `redis://localhost:6379/0` | Redis 连接（缓存 + Session） |
| `RUST_DOWNLOADER_URL` | string | `http://127.0.0.1:3080` | Rust 下载服务地址 |
| `CRAWL_CALLBACK_URL` | string | `http://127.0.0.1:8000` | Rust 完成后回调 Django 的地址 |

### 2.4 下载

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `JM_DOWNLOAD_IMAGE_CONCURRENCY` | int | `30` | 提交给 Rust 的单章节图片并发数 |
| `JM_DOWNLOAD_PHOTO_CONCURRENCY` | int | `3` | 同时下载的章节数 |
| `RUST_REQUEST_TIMEOUT` | int | `15` | Django→Rust HTTP 请求超时（秒） |
| `RUST_HTTP_MAX_CONNECTIONS` | int | `10` | Django→Rust 连接池上限 |
| `RUST_HTTP_MAX_KEEPALIVE` | int | `5` | Django→Rust 空闲保活连接数 |
| `CRAWL_STATE_TTL` | int | `86400` | 下载任务状态缓存过期（秒，默认 24h） |

### 2.5 jmcomic 客户端

仅注入本项目需要的客户端参数（基于 jmcomic 默认配置，不加载 option 文件）：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `JM_OPTION_TIMEOUT` | int | `30` | jmcomic 单请求超时（秒） |
| `JM_OPTION_RETRY_TIMES` | int | `5` | jmcomic 请求重试次数 |
| `JM_OPTION_DOMAINS` | csv | jmcomic 内置 | 自定义 API 域名列表（逗号分隔） |
| `PROXY` | string | — | 代理地址（jmcomic 与 Rust 下载服务共用；留空/不设置则 jmcomic 走自身默认、Rust 直连） |

### 2.6 分页与缓存

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `IMAGES_PER_PAGE` | int | `300` | 阅读器章内分页大小（图片数/页，在线/藏书阁/本地通用） |
| `LIST_PAGE_SIZE` | int | `30` | DRF 列表分页大小（藏书阁/本地库） |
| `SEARCH_CACHE_TTL` | int | `120` | 搜索结果缓存时长（秒） |
| `DETAIL_CACHE_TTL` | int | `120` | 在线详情/章节列表缓存（秒） |
| `COMMENT_CACHE_TTL` | int | `60` | 在线评论分页缓存（秒） |
| `CACHE_DEFAULT_TIMEOUT` | int | `300` | Redis 缓存默认过期（秒） |

### 2.7 媒体与数据库

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `MEDIA_ROOT` | path | `<BASE_DIR>/media` | 媒体文件根目录（Docker 内建议与卷一致） |
| `DB_NAME` | path | `<BASE_DIR>/db/db.sqlite3` | SQLite 数据库路径 |
| `DB_TIMEOUT` | int | `5` | SQLite 锁等待超时（秒） |
| `DB_CONN_MAX_AGE` | int | `60` | 数据库连接最大存活（秒） |
| `LOCAL_IMAGE_EXTS` | csv | `.jpg,.jpeg,.png,.webp,.gif` | 本地媒体识别的图片扩展名 |
| `LOCAL_VIDEO_EXTS` | csv | `.mp4,.webm,.mov,.mkv` | 本地媒体识别的视频扩展名 |

### 2.8 认证与日志

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `SESSION_COOKIE_AGE` | int | `604800`（7天） | Session 有效期（秒） |
| JWT Access/Refresh | timedelta | 7 天 | 代码内固定 |
| `ANON_THROTTLE_RATE` | string | `30/min` | 匿名接口限流 |
| `DJANGO_LOG_LEVEL` | string | `INFO` | 日志级别 |
| `DJANGO_LOG_DIR` | path | `<BASE_DIR>/logs` | 日志文件目录 |

---

## 3. 前端（`frontend/.env`）

Vite 构建时注入，仅 `VITE_` 前缀变量暴露给客户端。

### 3.1 阅读器性能

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `VITE_READER_MAX_LOADED` | int | `50` | 虚拟滚动窗口最大同时加载图片数 |
| `VITE_READER_PREFETCH_BELOW` | int | `8` | 向下预加载屏数 |
| `VITE_READER_PREFETCH_ABOVE` | int | `2` | 向上预加载屏数 |
| `VITE_READER_DECODE_ABOVE` | int | `2` | WASM 解码窗口向上屏数 |
| `VITE_READER_DECODE_BELOW` | int | `2` | WASM 解码窗口向下屏数 |
| `VITE_READER_CACHE_SIZE` | int | `60` | LRU 位图缓存容量 |

### 3.2 数据请求

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `VITE_QUERY_STALE_TIME` | int | `30000` | 全局 TanStack Query staleTime (ms) |
| `VITE_QUERY_RETRY` | int | `1` | 全局请求失败重试次数 |
| `VITE_READER_STALE_TIME` | int | `300000` | 阅读器图片/章节数据 staleTime (ms) |
| `VITE_CRAWL_POLL_INTERVAL` | int | `2000` | 下载进度轮询间隔 (ms，搜索详情/藏书阁详情/章节重试通用) |
| `VITE_API_BASE` | string | `/api` | API 基础路径（子路径/独立域名部署时覆盖） |

### 3.3 开发代理（仅 `pnpm dev` 生效）

| 参数 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| `server.port` | `vite.config.ts` | `5173` | 开发服务器端口 |
| `proxy /api →` | `vite.config.ts` | `http://localhost:8000` | 后端 API 代理目标 |
| `proxy /media →` | `vite.config.ts` | `http://localhost:8000` | 媒体文件代理目标 |

---

## 4. Nginx 反向代理（`nginx/default.conf`）

当前为静态配置，无环境变量注入。关键调优参数：

| 参数 | 当前值 | 说明 |
|------|--------|------|
| `gzip_comp_level` | `6` | Gzip 压缩等级 (1-9) |
| `client_max_body_size` | `100m` | API 请求体上限 |
| 静态资源 `expires` | `30d` / `1y` | 缓存过期（media / assets） |
| `proxy_buffering` | `off`（API） | 视频流式播放需要 |

---

## 5. Docker 基础设施（`docker-compose.yml`）

| 参数 | 当前值 | 说明 |
|------|--------|------|
| Redis `maxmemory` | `128mb` | Redis 内存上限 |
| Redis `maxmemory-policy` | `allkeys-lru` | 淘汰策略 |
| `web` mem_limit | `512m` | Django 容器内存限制 |
| `rust_downloader` mem_limit | `64m` | Rust 容器内存限制 |
| `nginx` mem_limit | `128m` | Nginx 容器内存限制 |
| rust `DECODE_CONCURRENCY` | `10` | 显式注入的反混淆并发数 |

---

## 6. 配置文件示例

### `rust-downloader/config.example.toml`

仓库内已提供，字段与 §1 一致。

### `.env.example`

项目根目录 `.env.example`，与 §2 全部字段同步，不含 Celery 遗留项。

### `frontend/.env.example`

```env
# 阅读器虚拟滚动性能参数（构建时注入，运行时不可变）
VITE_READER_MAX_LOADED=50
VITE_READER_PREFETCH_BELOW=8
VITE_READER_PREFETCH_ABOVE=2
VITE_READER_DECODE_ABOVE=2
VITE_READER_DECODE_BELOW=2
VITE_READER_CACHE_SIZE=60

# 数据请求行为
VITE_QUERY_STALE_TIME=30000
VITE_QUERY_RETRY=1
VITE_READER_STALE_TIME=300000
VITE_CRAWL_POLL_INTERVAL=2000

# API 基础路径（默认 /api）
# VITE_API_BASE=/api
```

---

## 7. 工程规范

1. **敏感值不入文件**：`SECRET_KEY`、`REGISTRATION_SECRET_KEY` 只通过环境变量或 Docker Secrets 注入
2. **config.toml 加入 .gitignore**：仓库只保留 `config.example.toml`
3. **环境变量命名**：全大写 + 下划线，TOML section 名作为前缀可选（如 `JM_LISTEN_ADDR`）
4. **类型校验**：解析失败时使用默认值并输出 WARN 日志，不 panic
5. **启动时打印配置摘要**：INFO 级别输出脱敏后的生效配置，便于排查
