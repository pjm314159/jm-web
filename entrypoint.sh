#!/bin/sh

# 如果执行的是 runserver 命令，则先运行数据库迁移
set -e  # 任何命令失败则退出，避免启动不完整的应用

echo ">>> Running database migrations..."
python manage.py migrate --noinput

echo ">>> Collecting static files..."
python manage.py collectstatic --noinput

echo ">>> Initializing local media cache..."
python -c "from comic.utils import scan_local_media_folders; scan_local_media_folders()" 2>/dev/null || echo "Warning: Media cache init skipped"

# 执行原始命令（例如 runserver 或 celery worker）
exec "$@"