#!/bin/sh

set -e

# 只有 web 服务执行 migrate 和 collectstatic，其他服务跳过避免 SQLite 锁冲突
if [ "$1" = "gunicorn" ]; then
    echo ">>> Running database migrations..."
    python manage.py migrate --noinput

    echo ">>> Collecting static files..."
    python manage.py collectstatic --noinput
fi

echo ">>> Initializing local media cache..."
python -c "from comic.utils import scan_local_media_folders; scan_local_media_folders()" 2>/dev/null || echo "Warning: Media cache init skipped"

# 执行原始命令（例如 gunicorn 或 celery worker）
exec "$@"