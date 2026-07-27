# 使用 Python 3.9 基础镜像
FROM python:3.9-slim

# 设置工作目录（后续所有命令都在此目录执行）
WORKDIR /app
# 创建celery用户
#RUN addgroup --system celery && adduser --system --group celery
COPY requirements.txt /app/

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制整个项目代码到容器中
COPY . /app/

# 切换到 Django 项目所在目录（manage.py 所在位置）
WORKDIR /app/JmWebProject

# 暴露开发服务器默认端口（run.md 中使用 7000）
EXPOSE 8000

# 复制启动脚本并赋予执行权限
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 设置容器启动入口
ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "JmWebProject.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "6"]