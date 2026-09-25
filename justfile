# 本地开发常用命令入口（需安装 just：https://github.com/casey/just）
# Windows 下使用 PowerShell 执行各命令
set shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

# 安装/同步依赖（含 dev 组）
install:
    uv sync --group dev

# ruff 检查（自动修复可修复项）
lint:
    uv run ruff check JmWebProject tests

# ruff 格式化
fmt:
    uv run ruff format JmWebProject tests

# 格式检查（CI 同款）
fmt-check:
    uv run ruff format --check JmWebProject tests

# mypy 类型检查
typecheck:
    uv run mypy

# 运行测试（带覆盖率）
test:
    uv run pytest

# Django system check
check:
    uv run python JmWebProject/manage.py check

# 检查迁移是否遗漏
migrations-check:
    uv run python JmWebProject/manage.py makemigrations --check --dry-run

# 执行数据库迁移
migrate:
    uv run python JmWebProject/manage.py migrate

# 收集静态文件
collectstatic:
    uv run python JmWebProject/manage.py collectstatic --noinput

# 启动开发服务器
run:
    uv run python JmWebProject/manage.py runserver

# 进入 Django shell
sh:
    uv run python JmWebProject/manage.py shell

# 提交前全量检查（与 CI check job 对齐）
verify: lint fmt-check typecheck test
