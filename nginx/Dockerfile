# Nginx 镜像：从前端构建阶段复制 SPA 产物
FROM node:22-slim AS frontend-build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ─── 最终 Nginx 镜像 ───
FROM nginx:latest

# 复制前端构建产物到 Nginx 默认静态目录
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# 复制自定义 Nginx 配置
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
