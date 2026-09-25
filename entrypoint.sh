#!/bin/sh

set -e

# 确保 db 目录存在（命名卷首次挂载时可能为空）
mkdir -p /app/JmWebProject/db

# 执行 migrate 和 collectstatic（该镜像仅用于 web 服务，无需条件判断）
echo ">>> Running database migrations..."
python manage.py migrate --noinput

echo ">>> Collecting static files..."
python manage.py collectstatic --noinput

# 执行原始命令（例如 gunicorn）
exec "$@"
