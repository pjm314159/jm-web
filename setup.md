# 本地开发环境搭建

## 前置要求

- Python 3.9+
- Redis

## 1. 克隆项目

```bash
git clone https://github.com/pjm314159/jm-web.git
cd jm-web
```

## 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的配置：

```ini
ALLOWED_HOST=127.0.0.1
DJANGO_SETTINGS_MODULE=JmWebProject.settings
DJANGO_SECRET_KEY=你的密钥
REGISTRATION_SECRET_KEY=你的注册密钥
CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8000
CORS_ALLOWED_ORIGINS=http://127.0.0.1
```

生成 Django Secret Key：

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

## 3. 安装依赖

```bash
pip install -r requirement.txt
```

## 4. 数据库迁移

```bash
cd JmWebProject
python manage.py makemigrations user
python manage.py makemigrations comic
python manage.py migrate
```

## 5. 启动 Redis

```bash
# Linux/Mac
redis-server

# Windows (如果已安装 Redis)
redis-server.exe

# 或使用 Docker
docker run -d -p 6379:6379 redis:alpine
```

## 6. 启动 Celery Worker

新开一个终端：

```bash
cd JmWebProject
celery -A JmWebProject worker --loglevel=info --pool=threads
```

## 7. 启动 Celery Beat（定时任务）

新开一个终端：

```bash
cd JmWebProject
celery -A JmWebProject beat --loglevel=info
```

## 8. 启动 Django 开发服务器

新开一个终端：

```bash
cd JmWebProject
python manage.py runserver
```

访问 http://127.0.0.1:8000

## 创建管理员账户

```bash
cd JmWebProject
python manage.py createsuperuser
```

---

## 一键启动（Docker）

如果不想手动启动各个服务，可以直接用 Docker Compose：

```bash
cp .env.example .env
# 编辑 .env 配置
docker-compose up -d --build
```

访问 http://127.0.0.1:8000

查看日志：

```bash
docker-compose logs -f web
```
