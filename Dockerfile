# ═══ Python 后端（Django + Celery） ═════════════════
FROM python:3.12-slim

# 安装 uv
# 默认走清华镜像
# 而 pip 会校验索引提供的哈希，导致构建失败；可通过 --build-arg PIP_INDEX_URL 覆盖。
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip install --no-cache-dir --index-url "$PIP_INDEX_URL" uv

# 设置工作目录
WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY pyproject.toml uv.lock ./

# 按锁文件安装依赖（生产：不含 dev 组，不安装项目本身）
# cache mount：uv 下载缓存跨构建复用，避免每次重新拉包
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-group dev --no-editable

# 复制整个项目代码到容器中
COPY . /app/

# 将虚拟环境加入 PATH（gunicorn / python 均走 .venv）
ENV PATH="/app/.venv/bin:$PATH"

# 切换到 Django 项目所在目录（manage.py 所在位置）
WORKDIR /app/JmWebProject

# 暴露端口
EXPOSE 8000

# 复制启动脚本并赋予执行权限（sed 防 Windows CRLF）
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# 设置容器启动入口
ENTRYPOINT ["/entrypoint.sh"]
# --timeout 0：关闭 worker 超时，避免网络不稳定时 jmcomic 重试期间
# gunicorn 强杀 worker 导致后端崩溃（详见 config.md）
CMD ["gunicorn", "JmWebProject.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "0"]
