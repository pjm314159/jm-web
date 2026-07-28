# JM-Website 前后端分离与异步化重构规划

## 1. 背景与目标

### 1.1 现状问题

- **前后端耦合**：当前使用 Django 模板渲染（`templates/`），视图同时承担数据组装与 HTML 渲染，无法支撑独立的前端应用。
- **爬虫为同步阻塞式**：`comic/tasks.py` 使用 `JmOption.default().new_jm_client()` 同步客户端 + `multi_thread_launcher` 线程池下载，Celery worker 内每个任务独占线程，IO 利用率低。
- **工程化缺失**：无日志系统（大量 `print`）、无测试、无统一代码规范、依赖用 `requirements.txt` 裸管理。

### 1.2 重构目标

1. **前后端分离**：React 独立前端 + Django 纯 JSON API 后端。
2. **爬虫异步化**：基于 jmcomic 官方异步 API（`AsyncJmApiClient`）重写爬取/下载链路（参考 <https://jmcomic.readthedocs.io/zh-cn/latest/tutorial/14_async_usage> 与 <https://jmcomic.readthedocs.io/zh-cn/latest/api/entity/>）。
3. **工程化补齐**：uv 包管理、Ruff 规范、logging 日志体系、pytest 测试体系（详见 `docs/linter.md`）。

### 1.3 非目标（本期不做）

- 不做多用户权限分级（保持现有「注册密钥 + 登录」模型）。
- 不更换数据库（继续 SQLite + WAL，已验证够用）。
- 不重写 jmcomic 库本身，仅消费其异步 API。

---

## 2. 目标总体架构

```
┌─────────────────────────────────────────────────────────┐
│                         nginx                           │
│  /            → React 静态产物 (frontend/dist)          │
│  /api/        → 反向代理 → Django (DRF)                 │
│  /media/      → 直接映射媒体目录（图片/视频流）          │
│  /static/     → Django admin 静态文件                   │
└─────────────────────────────────────────────────────────┘
        │                        │
┌───────┴───────┐      ┌────────┴────────────────────────┐
│  React SPA     │      │  Django + DRF (JSON API)        │
│  (Vite 构建)   │      │  - SimpleJWT 认证               │
│  端口 5173(开发)│     │  - CORS (django-cors-headers)   │
└────────────────┘      └────────┬────────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
          ┌─────┴─────┐   ┌──────┴──────┐  ┌─────┴──────┐
          │  SQLite   │   │    Redis    │  │ Celery     │
          │  (WAL)    │   │ cache+broker│  │ worker+beat│
          └───────────┘   └─────────────┘  └─────┬──────┘
                                                  │ asyncio.run
                                          ┌───────┴────────┐
                                          │ AsyncJmApiClient│
                                          │ (jmcomic async) │
                                          └────────────────┘
```

- **前端**：独立 `frontend/` 目录，Vite 开发服务器（5173）代理 `/api` 与 `/media` 到 Django；生产环境构建为静态文件由 nginx 托管。
- **后端**：Django 只暴露 `/api/**` JSON 接口，删除全部模板渲染视图；`admin/` 保留。
- **异步爬虫**：Celery 任务内以 `asyncio.run()` 驱动 jmcomic 异步客户端。

---

## 3. 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | React 18 + TypeScript + Vite | 社区主流，HMR 快 |
| 路由 | React Router v6 | 页面级路由 |
| 数据请求 | TanStack Query + Axios | 缓存/重试/轮询（任务进度） |
| 前端状态 | Zustand | 仅存 auth token 等轻量状态 |
| 样式 | Tailwind CSS | 替代现有手写 CSS，加快重构 |
| 后端框架 | Django 6 + Django REST Framework | 保留现有 models |
| 认证 | djangorestframework-simplejwt | 替代 session，前后端分离必需 |
| CORS | django-cors-headers | settings 中已有占位配置 |
| 异步爬虫 | jmcomic `AsyncJmApiClient` | 官方 async_api 实现 |
| 任务队列 | Celery + Redis（保留） | worker pool 改 `threads`，任务内跑事件循环 |
| 包管理 | uv（pyproject.toml + uv.lock） | 见 `docs/linter.md` |
| 质量工具 | Ruff / pytest / pre-commit | 见 `docs/linter.md` |

---

## 4. 后端重构设计（Django → DRF）

### 4.1 应用结构调整

```
JmWebProject/
├── JmWebProject/
│   ├── settings.py          # 增加 rest_framework / simplejwt / cors 配置，LOGGING 重写
│   ├── urls.py              # 只挂 /api/ 与 /admin/
│   └── celery.py            # 不变
├── user/
│   ├── serializers.py       # 新增：注册/用户序列化器
│   └── views.py             # 重写：register API；login/logout 交给 simplejwt
└── comic/
    ├── serializers.py       # 新增：Album/Photo/搜索/本地媒体序列化器
    ├── views.py             # 重写：全部改为 DRF APIView / ViewSet
    ├── services/            # 新增：业务层（与视图解耦，便于测试）
    │   ├── jm_async.py      # jmcomic 异步客户端封装
    │   ├── library.py       # 本子库查询/删除/检测更新
    │   └── local_media.py   # 本地目录扫描（由 utils.py 迁入）
    ├── tasks.py             # 重写：asyncio 驱动的爬取任务
    └── utils.py             # 保留 parse_jm_input / sanitize_filename 等纯函数
```

### 4.2 API 端点设计

所有端点统一前缀 `/api/`，统一响应约定：

```jsonc
// 成功: HTTP 2xx，直接返回数据或 {"data": ...}
// 失败: HTTP 4xx/5xx，{"error": {"code": "INVALID_INPUT", "message": "..."}}
```

#### 认证模块（/api/auth/）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register/` | 注册（校验 `secret_key` 注册密钥），返回 JWT |
| POST | `/api/auth/token/` | 登录，返回 `access` + `refresh`（simplejwt） |
| POST | `/api/auth/token/refresh/` | 刷新 access token |
| POST | `/api/auth/logout/` | refresh token 加入黑名单 |

- access token 有效期 30 分钟，refresh 7 天；启用 `ROTATE_REFRESH_TOKENS` 与黑名单。
- 前端在 Axios 拦截器中自动携带 `Authorization: Bearer <access>` 并处理 401 刷新。

#### 漫画库模块（/api/library/）

| 方法 | 路径 | 说明 | 对应旧视图 |
| --- | --- | --- | --- |
| GET | `/api/library/albums/?page=` | 本子卡片列表（含已下载章节，30/页） | `jm_album_list_view` |
| GET | `/api/library/albums/{id}/` | 本子详情 + 章节列表 | `jm_album_detail_view` |
| DELETE | `/api/library/albums/{id}/` | 删除（文件 + 缓存 + 数据库） | `album_delete_view` |
| POST | `/api/library/albums/{id}/check-updates/` | 对比远端章节，返回新章节 | `check_album_updates_view` |
| GET | `/api/library/photos/{id}/?page=&target=` | 阅读器数据（图片 URL 列表、分页、前后章节） | `jm_photo_detail_view` |

#### 爬取模块（/api/crawl/）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/crawl/` | 提交 `{ "input": "JM123 或链接" }`，内部 `parse_jm_input` 后派发 Celery 任务，返回 `{task_id}` |
| GET | `/api/crawl/tasks/{task_id}/` | 查询 Celery 任务状态（PENDING/PROGRESS/SUCCESS/FAILURE + 进度信息） |

- 新增任务状态查询接口，前端用 TanStack Query 轮询，替代当前的「提交后无反馈」。

#### 本地媒体模块（/api/local/）

| 方法 | 路径 | 说明 | 对应旧视图 |
| --- | --- | --- | --- |
| GET | `/api/local/media/` | 图片/视频文件夹列表（读 Redis 缓存） | `local_media_view` |
| POST | `/api/local/media/refresh/` | 清缓存并重扫 | `local_media_refresh_view` |
| GET | `/api/local/images/{folder}/?page=&jump=` | 文件夹图片分页 | `local_media_images_view` |
| GET | `/api/local/videos/{folder}/` | 文件夹视频列表 | `local_media_videos_view` |
| GET | `/api/local/stream/{folder}/{file}` | 视频 Range 流式播放（保留现有实现，改为 DRF 视图） | `stream_video_view` |

#### 在线搜索模块（/api/search/）

| 方法 | 路径 | 说明 | 对应旧视图 |
| --- | --- | --- | --- |
| GET | `/api/search/?q=&type=keyword\|tag&page=` | 搜索（异步调用 jmcomic，结果缓存 120s） | `search_view` |
| GET | `/api/search/albums/{jm_id}/` | 在线本子详情 + 更新检测 | `search_detail_view` |
| GET | `/api/search/albums/{jm_id}/episodes/` | 在线章节列表 | `search_preview_album_view` |
| GET | `/api/search/photos/{photo_id}/images/?page=&target=` | 在线阅读器（返回 `{url, num}` 列表，前端做反混淆拼接渲染） | `search_preview_photo_view` |

### 4.3 视图层异步策略

- DRF 视图保持**同步 def**，内部涉及 jmcomic 网络调用的统一走 `async_to_sync()` 桥接（asgiref 自带），避免把 DRF/ORM 拖入 async 复杂度。
- 网络耗时操作集中收口到 `comic/services/jm_async.py`，视图不直接 import jmcomic。
- ORM 操作全部留在同步侧，规避 SQLite 在异步上下文中的连接问题。

---

## 5. 爬虫异步化设计（核心）

### 5.1 异步客户端封装（comic/services/jm_async.py）

依据官方文档，异步客户端用法为 `async with op.new_jm_async_client() as cl`，离开作用域自动释放连接；不使用 `async with` 时需 `await cl.close()`。

设计原则：

1. **一个 Celery 任务 = 一个事件循环 = 一个异步客户端**。任务入口用 `asyncio.run()` 启动，任务内全程复用同一 `cl`，结束自动关闭。
2. **保留 TTL 语义**：原 `get_jm_client()` 的 1 小时 TTL 懒加载对异步客户端不再必要（每次任务新建客户端，天然不过期）。
3. **并发下载用信号量限流**，替代 `multi_thread_launcher`：图片级并发由 `asyncio.Semaphore` 控制（沿用 `jm-option.yml` 中 `download.threading.image: 30` 的语义，配置进 settings）。
4. **异常映射**：捕获 `MissingAlbumPhotoException`（ID 不存在）、`RequestRetryAllFailException`（重试耗尽）、`JsonResolveFailException`、`JmcomicException`（兜底），写入日志并反映到 Celery 任务结果。

核心骨架（示意）：

```python
# comic/services/jm_async.py
import asyncio
from jmcomic import JmOption

async def fetch_album_detail(album_id: str):
    async with JmOption.default().new_jm_async_client() as cl:
        return await cl.get_album_detail(album_id)

async def download_photo_images(cl, photo_detail, save_dir: str, max_concurrency: int = 30):
    sem = asyncio.Semaphore(max_concurrency)

    async def _one(image):
        async with sem:
            await cl.download_by_image_detail(image, f"{save_dir}/{image.filename}")

    await asyncio.gather(*(_one(img) for img in photo_detail))
```

### 5.2 Celery 任务改写（comic/tasks.py）

| 旧实现（同步） | 新实现（异步） |
| --- | --- |
| `get_jm_client()` 全局懒加载同步客户端 | 任务内 `asyncio.run()` + `async with new_jm_async_client()` |
| `client.get_album_detail(jm_id)` | `await cl.get_album_detail(jm_id)` |
| `client.get_photo_detail(jm_id, fetch_scramble_id)` | `await cl.get_photo_detail(jm_id, fetch_scramble_id)` |
| `client.search_site / search_tag` | `await cl.search_site(...) / search_tag(...)`（分页需求可换 `async for page in cl.search_gen(...)`） |
| `client.download_album_cover(id, path)` | `await cl.download_album_cover(id, path)` |
| `multi_thread_launcher` + 自定义 `Task` 迭代器下载图片 | `asyncio.gather` + `Semaphore` + `await cl.download_by_image_detail(img, filepath)` |
| `print(...)` | `logger.info/warning/exception(...)`（见 linter.md） |
| 串行 `for` 循环逐章下载 | 章节级 `asyncio.gather`（并发度由单独信号量控制，默认 3） |

任务入口形态：

```python
@shared_task(bind=True)
def crawl_jm_task(self, jm_type: str, jm_id: str) -> str:
    return asyncio.run(_crawl_jm_async(self, jm_type, jm_id))

async def _crawl_jm_async(task, jm_type: str, jm_id: str) -> str:
    async with JmOption.default().new_jm_async_client() as cl:
        if jm_type == "album":
            return await _crawl_album(task, cl, jm_id)
        return await _crawl_photo(task, cl, jm_id)
```

### 5.3 异步上下文中的 ORM 访问

- Celery worker 使用 `--pool=threads`（现状不变），每个任务线程内 `asyncio.run()` 拥有独立事件循环，与 Django 同步 ORM 兼容。
- 所有数据库读写（`update_or_create`、`get_or_create`、状态落库）一律抽到**同步函数**中，在异步流程里通过 `asgiref.sync.sync_to_async(..., thread_sensitive=True)` 调用，例如：

```python
save_album_meta_sync = sync_to_async(_save_album_meta_sync, thread_sensitive=True)
```

- 每章下载完成即落库（保持断点续传语义：已下载章节跳过逻辑不变）。
- 进度上报：任务内通过 `self.update_state(state='PROGRESS', meta={'current': i, 'total': n, 'photo_id': pid})`，供 4.2 的任务状态接口读取。

### 5.4 实体字段映射（API 序列化依据）

来自 jmcomic entity 文档，序列化器与前端类型定义以此为准：

- **JmAlbumDetail**：`album_id`、`scramble_id`、`name`、`description`、`episode_list: [(photo_id, index, name)]`、`authors: [str]`（`author` property 取首位）、`tags: [str]`、`actors: [str]`、`likes`、`views`、`comment_count`、`page_count`、`pub_date`、`update_date`；`episode_list` 已被 `distinct_episode` 去重排序。
- **JmPhotoDetail**：`photo_id`、`scramble_id`、`name`、`album_id`、`page_arr: [filename]`，可迭代得到 `JmImageDetail`。
- **JmImageDetail**：`img_url`、`filename`；阅读页反混淆序号用 `JmImageTool.get_num_by_url(scramble_id, img_url)`（纯计算，保持同步）。
- **JmSearchPage**：`content: [(album_id, info_dict)]`、`total`、`page_count`；`info_dict` 含 `name/author/tags/description/update_at/category`。
- 封面 URL：`JmcomicText.get_album_cover_url(album_id)`（纯计算，无需请求）。

---

## 6. 前端设计（React）

### 6.1 目录结构

```
frontend/
├── index.html
├── package.json
├── vite.config.ts           # dev server 代理 /api、/media → localhost:8000
├── src/
│   ├── main.tsx
│   ├── App.tsx              # 路由表 + 受保护路由（无 token 跳 /login）
│   ├── api/
│   │   ├── client.ts        # Axios 实例：baseURL=/api，JWT 拦截器，401 自动刷新
│   │   ├── auth.ts  library.ts  crawl.ts  local.ts  search.ts
│   ├── stores/auth.ts       # Zustand：token 持久化（localStorage）
│   ├── types/               # 与 5.4 实体对应的 TS 类型
│   ├── pages/
│   │   ├── LoginPage.tsx  RegisterPage.tsx
│   │   ├── HomePage.tsx            # 导航 Hub（对应旧 home.html）
│   │   ├── LibraryPage.tsx         # 本子卡片列表（分页）
│   │   ├── AlbumDetailPage.tsx     # 本子详情 + 章节 + 删除 + 检测更新
│   │   ├── ReaderPage.tsx          # 本地阅读器（分页 + target 跳转）
│   │   ├── CrawlPage.tsx           # 提交爬取 + 任务进度轮询展示
│   │   ├── LocalMediaPage.tsx      # 本地图片/视频文件夹
│   │   ├── LocalImagesPage.tsx  LocalVideosPage.tsx
│   │   ├── SearchPage.tsx          # 在线搜索（keyword/tag 切换）
│   │   ├── SearchDetailPage.tsx    # 在线本子详情
│   │   └── OnlineReaderPage.tsx    # 在线阅读器（Canvas 反混淆渲染）
│   └── components/          # AlbumCard / Pagination / ImageGrid / VideoPlayer ...
```

### 6.2 页面与旧模板映射

| 旧模板 | 新页面 | 数据源 API |
| --- | --- | --- |
| `user/login.html` / `register.html` | Login / Register | `/api/auth/*` |
| `comic/home.html` | HomePage | 静态导航 |
| `comic/jm_album_list.html` | LibraryPage | `GET /api/library/albums/` |
| `comic/jm_album_detail.html` | AlbumDetailPage | `GET/DELETE /api/library/albums/{id}/`、`check-updates` |
| `comic/jm_photo_detail.html` | ReaderPage | `GET /api/library/photos/{id}/` |
| `comic/crawl_form.html` | CrawlPage | `POST /api/crawl/` + 轮询 `tasks/{id}` |
| `comic/local_media.html` 等 | Local* | `/api/local/*` |
| `comic/search*.html` | Search* | `/api/search/*` |

### 6.3 关键实现点

- **图片反混淆**：在线阅读器沿用旧逻辑——后端返回 `{url, num}`，前端用 Canvas 按 `num` 切割重绘（把旧 `search_preview_reader.html` 中的 JS 逻辑移植为 React hook `useDescrambleImage`）。
- **视频播放**：原生 `<video>` 标签直链 `/media/videos/...` 或 `/api/local/stream/...`（Range 支持已在后端保留）。
- **任务进度**：CrawlPage 提交后拿到 `task_id`，TanStack Query 每 2s 轮询状态接口，展示 `current/total` 进度条，完成后失效（invalidate）library 相关查询缓存。
- **图片分页**：阅读器保持每页 300 张、URL 携带 `page`/`target` 参数，与后端分页参数一致。

---

## 7. 部署与配置变更

### 7.1 docker-compose

- 新增 `frontend` 构建阶段：多阶段 Dockerfile（node:20 构建 → 产物给 nginx）。
- `nginx` 服务：
  - `root` 指向 React 产物；`location / { try_files $uri /index.html; }`（SPA 回退）。
  - `location /api/ { proxy_pass http://web:8000; }`。
  - `location /media/` 保持现状直出。
- `web` 服务继续 gunicorn（同步 worker 即可，视图是同步的）。
- `celery_worker` 保持 `--pool=threads`，并发数可按 CPU 调整（异步后单任务吞吐提升，worker 数无需增加）。

### 7.2 settings.py 变更清单

- `INSTALLED_APPS` += `rest_framework`、`rest_framework_simplejwt.token_blacklist`、`corsheaders`。
- `MIDDLEWARE` 顶部加 `corsheaders.middleware.CorsMiddleware`。
- `REST_FRAMEWORK = {DEFAULT_AUTHENTICATION_CLASSES: (simplejwt JWTAuthentication,), DEFAULT_PERMISSION_CLASSES: (IsAuthenticated,), DEFAULT_PAGINATION_CLASS: PageNumberPagination(30)}`。
- `SIMPLE_JWT = {ACCESS_TOKEN_LIFETIME: 30min, REFRESH_TOKEN_LIFETIME: 7d, ROTATE_REFRESH_TOKENS: True, BLACKLIST_AFTER_ROTATION: True}`。
- 新增 `JM_DOWNLOAD_IMAGE_CONCURRENCY`（默认 30）、`JM_DOWNLOAD_PHOTO_CONCURRENCY`（默认 3）。
- `LOGGING` 按 `docs/linter.md` 重写（控制台 + 按天滚动文件）。
- 生产环境 `CORS_ALLOWED_ORIGINS` 收敛为前端域名；开发环境放开 `http://localhost:5173`。

### 7.3 .env.example 新增

```
# 前端开发代理目标（仅本地开发）
VITE_API_BASE_URL=http://localhost:8000
# 日志级别
DJANGO_LOG_LEVEL=INFO
```

---

## 8. 分阶段实施计划

> 每阶段独立可交付、可回归。建议按顺序执行；阶段 0 是所有后续工作的地基。

### 阶段 0：工程化基建（先行）

- [ ] 迁移 uv：生成 `pyproject.toml` + `uv.lock`，删除 `requirements.txt`；新增 dev 依赖组（ruff、pytest、pytest-django、pytest-asyncio、pre-commit）。
- [ ] 接入 Ruff（lint+format）并一次性格式化存量代码；接入 pre-commit。
- [ ] 落地 LOGGING 配置；将 `views.py`/`tasks.py` 中全部 `print` 替换为 logger。
- [ ] 建立 `tests/` 目录与 pytest 配置；先为纯函数（`parse_jm_input`、`sanitize_filename`、`natural_sort_key`）补测试。
- [ ] CI 切换 uv；新增 `ruff format --check`、`pytest` 步骤。
- 验收：`ruff check` / `ruff format --check` / `pytest` / `manage.py check` 全绿。

### 阶段 1：后端 API 化

- [ ] 引入 DRF、simplejwt、cors-headers；编写 settings。
- [ ] 编写 `comic/serializers.py`、`user/serializers.py`。
- [ ] 将 4.2 全部端点实现为 DRF 视图；网络调用暂仍走同步客户端（本阶段不改爬虫，保证行为不变）。
- [ ] 删除 `comic/templates/`、`user/templates/`、`templates/base.html`、`static/css`（前端接管后）。
- [ ] 为每个端点编写 API 测试（DRF `APIClient` + 认证）。
- 验收：API 测试全绿；旧前端废弃；接口可用 Postman/HTTPie 走通。

### 阶段 2：爬虫异步化

- [ ] 新建 `comic/services/jm_async.py`（客户端封装 + 异常映射 + 并发下载）。
- [ ] 重写 `tasks.py`：`asyncio.run` 入口、ORM 同步桥接、进度上报、logger 替换。
- [ ] 搜索/详情类接口改为 `async_to_sync` 调用异步客户端。
- [ ] 单元测试：mock `AsyncJmApiClient`，验证下载流程、异常路径、断点续传跳过逻辑。
- [ ] 基准对比：同一 album 下载耗时记录到 PR 描述（预期查询快 30%+、下载快 10%+）。
- 验收：全量任务测试绿；手工触发一次 album 下载与一次 photo 下载成功；搜索接口正常。

### 阶段 3：React 前端

- [ ] `npm create vite@latest frontend -- --template react-ts` 初始化；接入 Tailwind、React Router、TanStack Query、Zustand、Axios。
- [ ] 实现 api client + auth store + 受保护路由。
- [ ] 按 6.2 映射逐页实现（建议顺序：Login → Library → Reader → Crawl → Local → Search）。
- [ ] 移植在线阅读器反混淆 Canvas 逻辑。
- [ ] vite dev 代理联调；`npm run build` 产物验证。
- 验收：所有旧页面功能在新 SPA 可用；ESLint/TypeScript 零报错。

### 阶段 4：部署收尾

- [ ] 前端多阶段 Dockerfile；更新 `docker-compose.yml` 与 `nginx/default.conf`。
- [ ] `.env.example`、README、setup.md 同步更新。
- [ ] CI 增加前端 job（`npm ci && npm run lint && npm run build`）。
- [ ] 端到端回归：compose 全栈启动，注册→登录→搜索→爬取→阅读全链路验证。
- 验收：`docker compose up` 一键可用；CI 全绿。

---

## 9. 风险与注意事项

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| jmcomic 异步 API 仅支持 `async_api` 底层实现 | `client.impl` 语义与同步版不同 | `jm-option.yml` 增加 `client.async_impl: async_api`；注意文档说明：仅改配置不会异步化，必须改代码调用 `_async` 方法 |
| SQLite 并发写 | 章节级并发下载时多协程同时落库 | 所有 ORM 写走 `sync_to_async(thread_sensitive=True)` 串行化；保持 WAL；章节并发度默认保守值 3 |
| Celery 线程池 + asyncio 混用 | 事件循环泄漏/跨线程复用 | 每个任务独立 `asyncio.run()`；异步客户端仅在任务内创建与关闭 |
| 在线阅读器反混淆逻辑移植出错 | 图片显示错乱 | 移植时以旧 JS 为基准写单元测试（固定 scramble_id 断言切割参数） |
| JWT 泄露面大于 session | XSS 风险 | token 存内存 + localStorage（refresh），开启 rotation 与黑名单；CORS 白名单严格收敛 |
| 媒体文件路径兼容 | 旧数据图片 404 | 数据库 `save_path` 与磁盘结构不变，仅改读取方（模板 → API 返回 URL） |

## 10. 数据兼容性

- `Album` / `Photo` 模型**不变**，无需数据迁移。
- Redis 缓存键（`jmw-*`）语义不变，重构后继续生效。
- 媒体目录结构 `media/images/jmcomic/<本子>/<章节>/`、`media/images/local/`、`media/videos/` 不变。
