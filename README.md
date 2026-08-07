# JM-Website

基于 [jmcomic](https://github.com/hect0x7/JMComic-Crawler-Python) 开发的个人漫画管理网页：
在线搜索与阅读、一键下载入库、本地媒体浏览，前后端分离，Rust 微服务承担下载与图片反混淆。

## 功能特性

- **在线搜索与筛选**：关键词 / 标签搜索，支持排序、时间、分类、子分类筛选，关键词留空时按筛选条件浏览全部作品
- **在线阅读**：专辑详情、章节列表、评论区，图片由前端 WASM 解码器反混淆显示
- **一键下载**：提交后由 Rust 微服务并发下载 + 反混淆 + 写盘，支持断点续传、抖动重试、进度回调
- **本地漫画库**：已下载专辑管理（列表 / 详情 / 删除）、远端更新检测、本地阅读器
- **本地媒体浏览**：图片 / 视频文件夹浏览，视频在线播放（Nginx Range 直出 + Django 鉴权后的 X-Accel）
- **账号体系**：注册门控密钥 + JWT 登录（access / refresh 7 天，旋转 + 拉黑）

## 技术栈

| 组件 | 技术 |
| --- | --- |
| 后端 | Django 6 + Django REST Framework + Gunicorn |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query |
| 下载服务 | Rust（axum + reqwest + tokio），替代 Celery |
| 数据库 | SQLite（WAL 模式，PRAGMA 优化） |
| 缓存 | Redis（Django 缓存 + Rust 定时扫描协调） |
| 反向代理 | Nginx（静态托管 + 媒体直出 + API 反代） |
| 依赖管理 | uv（Python）、pnpm（前端）、cargo（Rust） |
| 部署 | Docker Compose（redis / web / rust_downloader / nginx） |

## 架构

```text
浏览器（React SPA）
      │
      ▼
Nginx :8000
  ├── /                  前端静态资源（Vite 构建产物）
  ├── /api/              Django API（Gunicorn :8000）
  ├── /api/v1/download/  Rust 下载微服务（:3080）
  ├── /media/images/     图片目录直出
  ├── /media/videos/     视频直出（支持 Range / X-Accel）
  └── /static/           Django 静态文件

Django ── jmcomic 加密 API ──► 禁漫站点（搜索 / 详情 / 元数据）
Rust   ── JM 图片 CDN ───────► 下载 + 反混淆 + 写盘
Redis  ── Django 缓存 / Rust 扫描调度
SQLite ── 专辑与章节元数据
```

关键设计：

- Nginx 是唯一对外入口（宿主端口 8000），`/` 返回 React 产物，`/api/` 反代 Django，媒体文件由 Nginx 直出。
- Django 退化为纯 JSON API：负责登录鉴权、jmcomic 元数据获取、任务编排、数据库读写。
- Rust 微服务替代原 Celery：并发图片下载、反混淆解码、断点续传、带抖动的重试、进度回调、失败清理、本地媒体目录定时扫描。
- 封面统一保存在专辑根目录 `media/images/jmcomic/{专辑名}/cover.png`，与数据库 `cover_path` 一致。

## 快速开始（Docker）

### 1. 克隆项目

```bash
git clone https://github.com/pjm314159/jm-web.git
cd jm-web
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少修改以下变量：

| 变量 | 说明 |
| --- | --- |
| `ALLOWED_HOST` | 访问域名或 IP，多个用逗号分隔 |
| `DJANGO_SECRET_KEY` | Django 密钥，务必修改 |
| `REGISTRATION_SECRET_KEY` | 注册门控密钥，注册时需输入 |
| `CSRF_TRUSTED_ORIGINS` | CSRF 信任来源，多个用逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | CORS 允许来源，多个用逗号分隔 |

生成 Django Secret Key：

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 3. 启动服务

```bash
docker compose up -d --build
```

首次启动会自动完成：

- `web` 容器执行数据库迁移、静态文件收集；
- 初始化本地媒体目录缓存（Redis）；
- `nginx` 构建阶段自动完成前端打包。

### 4. 访问

打开 `http://localhost:8000`，使用注册密钥创建账户后登录。

## 常用命令

```bash
# 查看日志
docker compose logs -f web
docker compose logs -f rust_downloader
docker compose logs -f nginx

# 代码更新后重建
docker compose up -d --build

# 停止 / 清空容器（不删数据卷）
docker compose down

# 进入容器执行管理命令
docker exec -it jm_django_web python manage.py createsuperuser
docker exec -it jm_django_web python manage.py shell
```

## 本地开发

前置要求：Python 3.12+、Node.js 22+、Rust 工具链、Redis。

### 后端

```bash
uv sync --locked --group dev
uv run python JmWebProject/manage.py migrate
uv run python JmWebProject/manage.py runserver
```

### 前端

```bash
cd frontend
pnpm install
pnpm dev
```

### Rust 下载服务

```bash
cd rust-downloader
REDIS_URL=redis://127.0.0.1:6379/0 MEDIA_ROOT=../JmWebProject/media cargo run
```

### Redis

```bash
docker run -d -p 6379:6379 redis:alpine
```

### 检查 / 测试

```bash
uv run ruff check JmWebProject/ tests/
uv run pytest
cd frontend && pnpm build && pnpm lint
cd rust-downloader && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## API 一览

| 模块 | 端点 | 说明 |
| --- | --- | --- |
| 认证 | `/api/auth/register/`、`/token/`、`/token/refresh/`、`/logout/` | 注册（需注册密钥）、登录、刷新、登出 |
| 在线搜索 | `GET /api/search/` | 关键词 / 标签搜索 + 筛选 |
| 在线详情 | `/api/search/albums/{jm_id}/`、`/episodes/`、`/comments/`、`/api/search/photos/{id}/images/` | 详情、章节、评论、阅读器图片 |
| 漫画库 | `/api/library/albums/`、`/api/library/photos/{pk}/` | 本地专辑管理、检测更新、标签 / 作者、本地阅读器 |
| 爬取 | `POST /api/crawl/`、`/api/crawl/tasks/{id}/`、`/api/crawl/callback/` | 提交下载、状态查询、Rust 完成回调 |
| 本地媒体 | `/api/local/media/`、`/images/{folder}/`、`/videos/{folder}/`、`/stream/{folder}/{file}/` | 图片 / 视频浏览与播放 |

### 搜索参数

| 参数 | 说明 | 取值 |
| --- | --- | --- |
| `q` | 关键词，可留空（空 = 全部） | 任意文本 |
| `type` | 搜索类型 | `keyword` / `tag` |
| `order_by` | 排序 | `mr` `mv` `mp` `tf` `tr` `md` `mv_m` `mv_w` `mv_t` |
| `time` | 时间范围 | `t`（今日）`w`（本周）`m`（本月）`a`（全部） |
| `category` | 分类 | `0` `doujin` `single` `short` `another` `hanman` `meiman` `doujin_cosplay` `3D` `english_site` |
| `sub_category` | 副分类 | `chinese` `japanese` `CG` `other` `3d` `cosplay` `youth` |

## 项目结构

```text
jm-web/
├── JmWebProject/
│   ├── JmWebProject/     # Django 项目配置（settings / urls）
│   ├── comic/            # 核心应用：models / views / serializers / services
│   │   └── services/     # 业务层（search / crawl / library / local_media / jm_async）
│   ├── user/             # 用户认证应用
│   ├── media/            # 媒体文件（下载的图片 / 视频）
│   └── db/               # SQLite 数据库
├── frontend/             # React SPA（Vite + TypeScript）
│   ├── src/pages/        # 页面
│   ├── src/components/   # 组件（含阅读器 / WASM 解码）
│   └── wasm/             # Rust → WASM 解码器源码
├── rust-downloader/      # 下载微服务（axum + reqwest）
├── nginx/                # Nginx 配置与前端构建镜像
├── tests/                # 后端测试
├── docs/                 # 设计 / 规划文档
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## CI

GitHub Actions（`.github/workflows/ci.yml`）在 push / PR 时自动执行：

- 后端：ruff lint / format、pytest、Django 系统检查、迁移检查、collectstatic；
- 前端：`pnpm install`（frozen-lockfile）、TypeScript 构建、oxlint；
- Rust：rustfmt、clippy（`-D warnings`）、release 构建；
- Docker：构建 `jm-web` 镜像并校验 compose 配置、启动全栈健康检查。

## 注意事项

- 本项目为个人使用开发，请勿直接部署为公开网站。
- 媒体文件通过 bind mount 持久化，`docker compose down` 不会删除数据；`db_data` / `redis_data` 为命名数据卷。
- 国内网络构建时：`web` 镜像默认使用清华 PyPI 镜像安装 uv（可用 `--build-arg PIP_INDEX_URL=...` 覆盖），Rust 镜像使用阿里云 apk 源与字节跳动 rsproxy 加速。
- 封面路径已统一为专辑根目录；旧数据的 `cover_path` 不会自动迁移。

## Thanks

感谢 [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python) 的开发者。
