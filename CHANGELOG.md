# 更新日志

本项目的所有重要变更将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复

- 前端：token 刷新后保存旋转出的新 refresh（旧 refresh 已被服务端拉黑，此前会导致二次刷新失败被强制登出）
- 回调接口 `/api/crawl/callback/` 豁免匿名限流（此前批量章节回调可能被 429 丢弃）
- 回调接口新增共享密钥校验（`INTERNAL_CALLBACK_TOKEN`，Rust 回调附带 `X-Internal-Token` 头；未配置时不校验，仅限本地开发）

### 工程化整改

- settings 拆分为 `settings/{base,dev,prod,test}.py`，按 `DJANGO_SETTINGS_MODULE` 选择环境
- `DJANGO_SECRET_KEY` 与 `REGISTRATION_SECRET_KEY` 强制由环境变量提供，缺失即启动失败
- 生产配置（`settings/prod.py`）：强制 `DEBUG=False`，新增 HTTPS/HSTS/Cookie 安全开关（env 可控，默认关闭）
- Python 版本下限统一为 3.12（`pyproject.toml`、ruff、CI、Dockerfile、`.python-version`）
- 引入 mypy 类型检查（dev 依赖 + `[tool.mypy]` 配置 + CI 步骤），修复存量类型问题
- CI ruff 范围扩展至 `tests/`，新增 mypy 步骤
- 修复 collectstatic 输出目录（`staticfiles` → `static`）与 nginx 挂载不一致导致的静态文件 404
- `entrypoint.sh` 移除已无意义的 gunicorn 条件判断
- 删除 `user/tests.py` 空脚手架残留
- 新增 `justfile`（本地常用命令入口）、`CONTRIBUTING.md`

## [2.0.0]

- Rust 下载微服务替代 Celery Worker + Beat
- 前端迁移至 React + Vite + TypeScript（含 WASM）
- Docker Compose 四服务编排（redis / web / rust_downloader / nginx）
- JWT 认证（SimpleJWT，access/refresh 旋转 + 拉黑）
- 本地媒体库、搜索缓存、匿名限流等业务功能（详见 README）
