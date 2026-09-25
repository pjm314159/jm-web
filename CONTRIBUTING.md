# 贡献指南

感谢参与本项目！请先阅读 [README.md](README.md) 了解项目架构。

## 开发环境

依赖统一由 [uv](https://docs.astral.sh/uv/) 管理（Python >= 3.12）：

```powershell
# 安装依赖（含 dev 组：ruff / pytest / mypy / pre-commit）
uv sync --group dev

# 安装 pre-commit 钩子
uv run pre-commit install
```

首次运行需要在仓库根目录准备 `.env`（参考 `.env.example`），
本地开发必需：`DJANGO_SECRET_KEY`、`REGISTRATION_SECRET_KEY`。

## 常用命令

以下命令均已封装在 [justfile](justfile) 中（需安装 [just](https://github.com/casey/just)）：

| 命令 | 作用 |
|---|---|
| `just install` | 安装/同步依赖 |
| `just lint` | ruff 检查（自动修复） |
| `just fmt` | ruff 格式化 |
| `just typecheck` | mypy 类型检查 |
| `just test` | 运行测试（带覆盖率） |
| `just check` | Django system check |
| `just migrate` | 执行数据库迁移 |
| `just run` | 启动开发服务器 |

不想安装 just 的话，可直接运行对应 uv 命令（见 justfile 内的实现）。

## 代码规范

- **格式化**：ruff format（行宽 100，双引号），提交前自动执行（pre-commit）
- **Lint**：规则集见 `pyproject.toml` 的 `[tool.ruff.lint]`，禁止 `print`（T20）
- **类型**：mypy 起步宽松（`ignore_missing_imports`），新代码请补充类型注解
- **settings**：公共配置进 `settings/base.py`，环境差异进 dev/prod/test，
  不要在业务代码中读取环境变量，统一通过 `django.conf.settings`
- **提交**：建议使用祈使句简短描述，如 `fix: 修复xxx`、`feat: 新增xxx`

## 测试

- 测试位于根目录 `tests/`，运行 `just test`
- 测试使用 `settings.test`：locmem 缓存（不依赖 Redis）+ MD5 密码哈希（加速）
- 提交前请确保：`just lint && just typecheck && just test` 全部通过

## CI

推送 / PR 到 `master` 会触发 GitHub Actions（`.github/workflows/ci.yml`）：

1. **check**：ruff + mypy + pytest + migrate/collectstatic 冒烟
2. **frontend**：pnpm build + oxlint
3. **rust**：cargo fmt/clippy/build
4. **docker**：镜像构建 + compose 起服健康检查
