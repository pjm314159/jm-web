# JM-Website

基于 [jmcomic](https://github.com/hect0x7/JMComic-Crawler-Python) 开发的个人漫画管理网页：
在线搜索与阅读、一键下载入库、本地媒体浏览，前后端分离，Rust 微服务承担下载与图片反混淆。

## 功能特性

- **在线搜索与筛选**：关键词 / 标签 / 作者搜索 + 排行榜浏览（月 / 周 / 日排行），支持排序、时间、分类、子分类筛选，关键词留空时按筛选条件浏览全部作品
- **在线阅读**：专辑详情、章节列表、评论区（等级 / 头像 / 奖牌展示），图片由前端 WASM 解码器反混淆显示（GIF 原始渲染）
- **一键下载**：提交后由 Rust 微服务并发下载 + 反混淆 + 写盘，支持断点续传、抖动重试、进度回调；GIF 原样保存；失败章节可单章重试或一键重下
- **本地漫画库**：已下载专辑管理（列表 / 详情 / 删除）、远端更新检测、本地阅读器、评论区（默认收起，点击展开）
- **本地媒体浏览**：图片 / 视频文件夹浏览，视频在线播放（Nginx Range 直出 + Django 鉴权后的 X-Accel）
- **账号体系**：注册门控密钥 + JWT 登录（access / refresh 7 天，旋转 + 拉黑）
- **个人资料**：关联 JM 账号（密码强加密存储）并同步收藏夹，展示等级 / 头像 / 奖牌等信息

## 技术栈

| 组件 | 技术 |
| --- | --- |
| 后端 | Django 6 + Django REST Framework + Gunicorn |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query |
| 下载服务 | Rust（axum + reqwest + tokio），替代 Celery |
| 数据库 | SQLite（WAL 模式，PRAGMA 优化） |
| 缓存 | Redis（Django 缓存 + 本地媒体扫描结果） |
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
  ├── /media/images/     图片目录直出
  ├── /media/videos/     视频直出（支持 Range / X-Accel）
  └── /static/           Django 静态文件

Django ── jmcomic ─────────► 禁漫站点（搜索 / 详情 / 评论 / 元数据）
Rust   ── JM 图片 CDN ─────► 下载 + 反混淆 + 写盘
Redis  ── Django 缓存 / 本地媒体扫描结果
SQLite ── 专辑与章节元数据
```

关键设计：

- Nginx 是唯一对外入口，`/` 返回 React 产物，`/api/` 反代 Django，媒体文件由 Nginx 直出。
- Django 负责登录鉴权、jmcomic 元数据获取、任务编排、数据库读写；下载编排通过内部 HTTP 调用 Rust 微服务（容器内 `rust_downloader:3080`）。
- Rust 微服务：并发图片下载、反混淆解码、断点续传、带抖动的重试、进度回调、失败清理、本地媒体目录定时扫描；任务队列为进程内存，Redis 用于 Django 缓存与本地媒体扫描结果。

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
| `ALLOWED_HOST` | 访问域名或 IP（单个主域名；127.0.0.1 / localhost 自动允许） |
| `DJANGO_SECRET_KEY` | Django 密钥，务必修改 |
| `REGISTRATION_SECRET_KEY` | 注册门控密钥，注册时需输入 |
| `CSRF_TRUSTED_ORIGINS` | CSRF 信任来源，逗号分隔 |
| `CORS_ALLOWED_ORIGINS` | CORS 允许来源，逗号分隔 |

可选：网络环境需要代理时设置 `PROXY=http://127.0.0.1:10808`（jmcomic 与 Rust 图片下载共用，留空则直连）。

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

也支持 `config.toml` 配置文件（参考 `config.example.toml`），可用 `--config <path>` 或 `JM_CONFIG_FILE` 指定。

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

## 配置说明

- 全部可配置参数（后端环境变量、Rust config.toml、前端 VITE_*、Nginx、Docker）见 [docs/config.md](docs/config.md)。
- gunicorn 启动参数说明见根目录 [config.md](config.md)。
- 环境变量示例：`.env.example`（后端）、`frontend/.env.example`（前端）。

## 项目结构

```text
jm-web/
├── JmWebProject/
│   ├── JmWebProject/     # Django 项目配置（settings / urls）
│   ├── comic/            # 核心应用：models / views / serializers / services
│   │   └── services/     # 业务层（search / crawl / library / local_media / jm_sync / jm_async）
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
├── docs/                 # 设计 / 规划 / 配置文档
├── docker-compose.yml
├── Dockerfile
├── config.md
└── .env.example
```

## 注意事项

- 本项目为个人使用开发，请勿直接部署为公开网站。
- 媒体文件通过 bind mount 持久化，`docker compose down` 不会删除数据；`db_data` / `redis_data` 为命名数据卷。
- 国内网络构建时：`web` 镜像默认使用清华 PyPI 镜像安装 uv（可用 `--build-arg PIP_INDEX_URL=...` 覆盖），Rust 镜像使用阿里云 apk 源与字节跳动 rsproxy 加速。
- 封面路径已统一为专辑根目录；旧数据的 `cover_path` 不会自动迁移。

## Thanks

感谢 [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python) 的开发者。
