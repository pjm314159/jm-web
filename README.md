# JM-Website

基于 [jmcomic](https://github.com/hect0x7/JMComic-Crawler-Python) 模块开发的个人漫画管理网页。

## 功能

- 在线搜索与预览
- 本地化下载（Celery 异步任务 + 多线程）
- 密钥注册登录
- 本地资源浏览（图片 / 视频）
- 在线阅读器

## 技术栈

| 组件 | 技术 |
|------|------|
| Web 框架 | Django  |
| 任务队列 | Celery + Redis |
| 数据库 | SQLite (WAL 模式) |
| 缓存 | Redis |
| Web 服务器 | Gunicorn + Nginx |
| 部署 | Docker Compose |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-repo/jm-website.git
cd jm-website
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少修改以下配置：

| 变量 | 说明 |
|------|------|
| `ALLOWED_HOST` | 你的域名或 IP |
| `DJANGO_SECRET_KEY` | Django 密钥（务必修改） |
| `REGISTRATION_SECRET_KEY` | 注册密钥（用户注册时需要输入） |
| `CSRF_TRUSTED_ORIGINS` | CSRF 信任来源 |
| `CORS_ALLOWED_ORIGINS` | CORS 允许来源 |

生成 Django Secret Key：

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 3. 启动服务

```bash
docker-compose up -d --build
```

服务启动后会自动执行：
- 数据库迁移
- 静态文件收集
- 本地媒体目录扫描（初始化 Redis 缓存）

### 4. 访问

打开 `http://your-domain:8000`，使用注册密钥创建账户后登录。

## 架构

```
Nginx (:8000)
  ├── /static/     → 静态文件 (CSS/JS)
  ├── /media/      → 媒体文件 (图片/视频)
  └── /            → Gunicorn (Django)
                      ├── Web 服务 (3 workers)
                      ├── Celery Worker (线程池)
                      └── Celery Beat (定时任务)
Redis
  ├── Celery Broker
  ├── Django Cache (搜索/目录缓存)
  └── Session Store
```

## 项目结构

```
jm-website/
├── JmWebProject/
│   ├── JmWebProject/     # Django 项目配置
│   │   ├── settings.py   # 核心配置
│   │   ├── celery.py     # Celery 配置
│   │   └── urls.py       # 根路由
│   ├── comic/            # 核心应用
│   │   ├── views.py      # 视图
│   │   ├── tasks.py      # Celery 异步任务
│   │   ├── models.py     # 数据模型
│   │   ├── utils.py      # 工具函数（目录扫描等）
│   │   └── templates/    # 模板
│   ├── user/             # 用户认证应用
│   ├── media/            # 媒体文件（下载的图片/视频）
│   ├── db/               # SQLite 数据库
│   └── static/           # 静态文件（CSS）
├── nginx/
│   └── default.conf      # Nginx 配置
├── docker-compose.yml
├── Dockerfile
├── entrypoint.sh
├── .env.example
└── docs/
    ├── performance-analysis.md
    └── tasks.md
```

## 常用命令

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f web
docker-compose logs -f celery_worker

# 重建镜像（代码更新后）
docker-compose up -d --build

# 停止服务
docker-compose down

# 进入容器执行管理命令
docker exec -it jm_django_web python manage.py createsuperuser
docker exec -it jm_django_web python manage.py shell
```

## 注意事项

- 本项目为个人使用开发，请勿部署为公开网站
- `REGISTRATION_SECRET_KEY` 是注册门控，请设置强密钥
- 媒体文件通过 Docker Volume 持久化，`docker-compose down` 不会删除数据
- 本地资源页有「刷新缓存」按钮，手动添加文件后点击即可更新

## Thanks

感谢 [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python) 的开发者。
