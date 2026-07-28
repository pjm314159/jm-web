# 工程化规范：包管理、代码规范、日志与测试

本文档是 JM-Website 重构（见 `docs/plan.md` 阶段 0）的工程化标准，覆盖四块：

1. **uv 包管理** —— 替代 `requirements.txt` + `pip`
2. **代码规范** —— Ruff（lint + format）+ 命名/类型注解约定
3. **日志系统** —— 统一 `logging`，禁止 `print`
4. **测试体系** —— pytest + 覆盖率 + CI 门禁

---

## 1. 包管理：uv

### 1.1 原则

- 依赖唯一事实来源是 **`pyproject.toml`**，锁定文件是 **`uv.lock`**；`requirements.txt` 删除。
- 所有安装/运行命令一律经 uv，不在项目内裸用 `pip` / `python`（uv 管理虚拟环境 `.venv`）。
- `uv.lock` 必须提交 Git；CI 与 Docker 构建均按锁文件安装，保证环境可复现。

### 1.2 pyproject.toml 结构

```toml
[project]
name = "jm-web"
version = "2.0.0"
description = "JM comic web library with async crawler"
requires-python = ">=3.11"
dependencies = [
    "django>=5.0",
    "djangorestframework",
    "djangorestframework-simplejwt",
    "django-cors-headers",
    "celery>=5.4",
    "redis",
    "django-redis",
    "jmcomic",
    "pillow",
    "gunicorn",
    "python-dotenv",
]

[dependency-groups]
dev = [
    "ruff",
    "pytest",
    "pytest-django",
    "pytest-asyncio",
    "pytest-cov",
    "pre-commit",
]

[tool.uv]
package = false   # 项目是应用而非库，不构建 wheel
```

### 1.3 常用命令对照

| 目的 | 旧命令 | 新命令 |
| --- | --- | --- |
| 创建/同步环境 | `python -m venv .venv && pip install -r requirements.txt` | `uv sync`（含 dev 依赖：`uv sync --group dev`） |
| 新增依赖 | 手写进 requirements.txt 再 `pip install` | `uv add django`（dev 依赖：`uv add --group dev ruff`） |
| 移除依赖 | 手删 | `uv remove <pkg>` |
| 升级依赖 | 无规范 | `uv lock --upgrade` / `uv lock --upgrade-package <pkg>` |
| 运行命令 | `python manage.py ...` | `uv run python manage.py ...` |
| 运行测试 | 无 | `uv run pytest` |

> Python 版本一并升级到 **3.11+**（uv 可自动管理解释器：`uv python install 3.12`）。原 3.9 已接近 EOL，且异步代码（`asyncio.TaskGroup`、`tomllib` 等）受益于新版本。

### 1.4 Dockerfile 变更

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-group dev --no-editable
COPY . /app/
ENV PATH="/app/.venv/bin:$PATH"
WORKDIR /app/JmWebProject
# entrypoint / CMD 不变（gunicorn 走 .venv）
```

要点：`--locked` 严格按锁文件安装；生产镜像不含 dev 组；`.venv` 加入 `.dockerignore` / `.gitignore`。

### 1.5 CI 变更（ci.yml）

- `pip install -r requirements.txt ruff` → `pipx install uv`（或 `astral-sh/setup-uv@v5` action）后 `uv sync --locked --group dev`。
- Python 版本改为 3.12；缓存改用 uv 缓存（`setup-uv` 自带 `enable-cache`）。

---

## 2. 代码规范

### 2.1 工具链：Ruff 一把梭

Ruff 同时承担 **linter**（替代 flake8/isort/pyupgrade）与 **formatter**（替代 black）。配置全部写在 `pyproject.toml`：

```toml
[tool.ruff]
target-version = "py311"
line-length = 100
extend-exclude = ["migrations", ".venv", "frontend", "node_modules"]

[tool.ruff.lint]
select = [
    "E", "W",   # pycodestyle
    "F",        # pyflakes
    "I",        # isort（导入排序）
    "UP",       # pyupgrade（自动用新语法）
    "B",        # bugbear（常见 bug 模式）
    "SIM",      # 简化建议
    "RUF",      # ruff 专属规则
    "ASYNC",    # 异步误用检查（重构后大量 async 代码）
    "S",        # bandit 安全规则
]
ignore = [
    "S101",     # 测试允许 assert（pytest 场景）
]

[tool.ruff.lint.per-file-ignores]
"**/tests/**" = ["S", "SIM117"]
"**/migrations/**" = ["E501"]

[tool.ruff.format]
quote-style = "double"
```

### 2.2 强制约定（lint 管不到的）

- **命名**：模块/函数/变量 `snake_case`；类 `PascalCase`；常量 `UPPER_SNAKE_CASE`；私有成员单下划线前缀。禁止 `temp_photo_detail`、`p`、`ep` 这类无意义短名（函数参数/短闭包除外）。
- **导入顺序**：标准库 → 第三方 → 本地应用（Ruff `I` 自动排序，禁止手工堆放）；禁止 `import *`；禁止在函数体内做顶层级 import（除循环依赖豁免并注明原因）。
- **类型注解**：所有**新写/重写**的公共函数必须有参数与返回值注解；内部小函数鼓励注解。异步函数显式标注返回值，如 `async def fetch_album_detail(album_id: str) -> JmAlbumDetail`。
- **注释/docstring**：公共模块、类、非平凡函数写中文 docstring（一句话「做什么」，复杂函数补充参数说明）；行内注释解释「为什么」而非复述代码。禁止提交大块注释掉的死代码（如旧 `views.py` 中被注释的整个 `local_media_detail_view`——直接删除，历史交给 Git）。
- **函数职责**：视图只做「解析请求 → 调 service → 返回响应」；业务逻辑（jmcomic 调用、缓存、数据库组装）放 `services/` 层；纯工具函数放 `utils.py`。
- **异常处理**：禁止裸 `except:` 与静默 `except Exception: pass`。允许 `except SpecificError: logger.warning(...)`；必须吞咽异常时注释说明原因（如缓存清理失败不阻断主流程）。jmcomic 调用按 `MissingAlbumPhotoException → RequestRetryAllFailException → JsonResolveFailException → JmcomicException` 顺序捕获。
- **魔数**：分页大小（300）、缓存 TTL、并发度等一律提升为 `settings` 配置或模块级常量，命名自解释。
- **路径处理**：新代码统一 `pathlib.Path`（存量 `os.path.join` 逐步替换）；构造对外 URL 时注意 `/` 与 `\` 的平台差异。

### 2.3 pre-commit

`.pre-commit-config.yaml`：

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```

安装：`uv run pre-commit install`。提交即自动检查/修复，过不去的提交不允许合入。

### 2.4 前端规范

#### 工具链

| 职责 | 工具 | 配置文件 |
| --- | --- | --- |
| Lint | oxlint（Rust 实现，兼容 ESLint 规则） | `frontend/.oxlintrc.json` |
| 类型检查 | TypeScript `tsc --noEmit`（严格模式） | `frontend/tsconfig.app.json` |
| 构建 | Vite 8（`pnpm build` = `tsc -b && vite build`） | `frontend/vite.config.ts` |
| 包管理 | pnpm（锁文件 `pnpm-lock.yaml`） | `frontend/package.json` |

#### oxlint 配置说明

```jsonc
// frontend/.oxlintrc.json
{
  "plugins": ["react", "typescript", "oxc", "unicorn", "import", "react-perf", "promise"],
  "categories": {
    "correctness": "error",   // 明确错误：未使用变量、条件恒真等
    "suspicious": "error",    // 高度可疑：debugger、重复 case 等
    "pedantic": "warn",       // 严格风格：eqeqeq、max-lines 等
    "perf": "warn"            // 性能建议
  }
}
```

**强制规则（error 级别，CI 必须零 error）：**

- `typescript/no-unused-vars` — 禁止未使用变量/导入
- `typescript/consistent-type-imports` — 类型导入必须用 `import type`
- `react/rules-of-hooks` — Hooks 调用规则
- `no-debugger` — 禁止提交 debugger
- `correctness` / `suspicious` 分类全量启用

**警告规则（warn 级别，不阻断但应逐步清理）：**

- `no-console`（允许 `console.warn` / `console.error`）
- `typescript/no-explicit-any`
- `max-lines`（单文件 ≤ 700 行，跳过注释/空行）
- `max-lines-per-function`（单函数 ≤ 500 行，JSX 组件天然冗长）
- `eqeqeq`（强制 `===`，`null` 比较豁免）

**已关闭规则（不适用于本项目）：**

| 规则 | 关闭原因 |
| --- | --- |
| `react/react-in-jsx-scope` | React 19 新 JSX 转换，无需手动 import React |
| `react/no-array-index-key` | 静态列表场景 index key 合理 |
| `react-perf/*` | 本项目无性能瓶颈，避免过度优化噪音 |
| `import/no-unassigned-import` | CSS 副作用导入 `import './x.css'` 是正常用法 |
| `unicorn/filename-case` | 组件文件用 PascalCase，hooks 用 camelCase，不强制统一 |
| `unicorn/no-null` | null 在 API 响应中广泛使用 |
| `no-underscore-dangle` | 私有变量 `_` 前缀是合理约定 |

#### TypeScript 严格配置

```jsonc
// frontend/tsconfig.app.json（关键项）
{
  "compilerOptions": {
    "noUnusedLocals": true,       // 未使用局部变量报错
    "noUnusedParameters": true,   // 未使用参数报错
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true  // 强制 type-only import
  }
}
```

#### 命名约定

| 类型 | 规范 | 示例 |
| --- | --- | --- |
| 组件文件 | `PascalCase.tsx` | `AlbumCard.tsx`、`VideoPlayer.tsx` |
| Hook 文件 | `useXxx.ts` | `useTheme.ts`、`useReaderSettings.ts` |
| API 模块 | `camelCase.ts` | `auth.ts`、`local.ts` |
| 工具模块 | `camelCase.ts` | `apiError.ts`、`tokenStorage.ts` |
| 组件导出 | `PascalCase` | `export default function AlbumCard()` |
| 函数/变量 | `camelCase` | `getAlbums`、`isLoading` |
| 类型/接口 | `PascalCase` | `interface AlbumItem`、`type SearchType` |
| 常量 | `UPPER_SNAKE_CASE` | `const EP_PER_PAGE = 20` |

#### CI 前端流水线

```yaml
frontend job:
  pnpm install --frozen-lockfile
  pnpm build          # 内含 tsc -b（类型检查）+ vite build
  oxlint              # lint 零 error
```

- **零 error 门禁**：`oxlint` 出现任何 error 级别问题则 CI 失败。
- **构建门禁**：`tsc -b` 类型不通过则构建失败。
- warn 级别不阻断 CI，但 code review 时应关注新增 warning。

---

## 3. 日志系统

### 3.1 原则

- **全面禁止 `print`**（Ruff 可由规则 `T201` 兜底——重构时将其加入 select）。
- 每个模块顶部 `logger = logging.getLogger(__name__)`，不配置 handler（由 root 配置统一分发）。
- 日志级别语义：
  - `DEBUG`：调试细节（图片逐张下载、缓存命中明细），默认关闭。
  - `INFO`：关键业务节点（任务开始/完成、章节落库、缓存重建）。
  - `WARNING`：可恢复异常（封面下载失败、缓存清理失败）。
  - `ERROR`：业务失败但进程存活（任务失败、API 5xx）。
  - `logger.exception(...)` 只在 `except` 块内使用（自动带堆栈）。

### 3.2 settings.LOGGING 配置

```python
LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO")
LOG_DIR = Path(os.getenv("DJANGO_LOG_DIR", BASE_DIR / "logs"))
LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {process:d} {thread:d} | {message}",
            "style": "{",
        },
        "simple": {"format": "[{asctime}] {levelname} {name} | {message}", "style": "{"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": LOG_DIR / "jmweb.log",
            "when": "midnight",
            "backupCount": 14,
            "encoding": "utf-8",
            "formatter": "verbose",
        },
        "celery_file": {
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": LOG_DIR / "celery.log",
            "when": "midnight",
            "backupCount": 14,
            "encoding": "utf-8",
            "formatter": "verbose",
        },
    },
    "root": {"handlers": ["console", "file"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {  # 4xx/5xx 请求日志
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "comic.tasks": {  # 爬虫任务单独落文件，便于排查下载问题
            "handlers": ["console", "celery_file"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "jmcomic": {"level": "WARNING"},  # 第三方库降噪
        "celery": {"level": "INFO"},
    },
}
```

要点：

- `logs/` 目录加入 `.gitignore`；docker-compose 为 web/celery 挂载 `./logs:/app/JmWebProject/logs` 卷持久化。
- 爬虫任务日志与请求日志分文件：下载问题翻 `celery.log`，接口问题翻 `jmweb.log`。
- Docker 环境中控制台 handler 同时输出，兼容 `docker compose logs` 采集。

### 3.3 存量替换清单

| 位置 | 现状 | 替换为 |
| --- | --- | --- |
| `comic/tasks.py` 全部 `print` | 下载进度/异常 | `logger.info` / `logger.warning` / `logger.exception` |
| `comic/views.py` 删除/搜索中的 `print` | 同上 | 同上；视图异常由 DRF 统一返回 + `django.request` 记录 |
| `comic/services/*`（新增） | —— | 每个 service 函数入口/失败点打 INFO/ERROR |

---

## 4. 测试体系

### 4.1 工具与配置

- **pytest + pytest-django + pytest-asyncio + pytest-cov**，配置写在 `pyproject.toml`：

```toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "JmWebProject.settings"
python_files = ["test_*.py", "*_test.py"]
pythonpath = ["JmWebProject"]
addopts = "-q --reuse-db --cov=comic --cov=user --cov-report=term-missing"
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"

[tool.coverage.run]
omit = ["*/migrations/*", "*/tests/*", "manage.py"]
```

- 测试目录布局（与 app 平级聚合，不散落在 app 内）：

```
tests/
├── conftest.py          # 全局 fixtures（api_client、auth_user、tmp_media、mock jm client）
├── user/
│   └── test_auth_api.py
└── comic/
    ├── test_utils.py        # parse_jm_input / sanitize_filename / natural_sort_key
    ├── test_library_api.py
    ├── test_crawl_api.py
    ├── test_local_api.py
    ├── test_search_api.py
    ├── test_services_jm_async.py   # 异步下载流程（mock AsyncJmApiClient）
    └── test_tasks.py
```

### 4.2 分层测试策略

| 层 | 内容 | 手段 |
| --- | --- | --- |
| 纯函数 | `parse_jm_input`、`sanitize_filename`（含 Windows 非法字符/路径遍历/超长截断）、`natural_sort_key` | 参数化测试（`@pytest.mark.parametrize`），零 mock |
| service 层 | `jm_async.download_photo_images` 并发与限流、异常映射、断点续传跳过 | mock `AsyncJmApiClient`（`unittest.mock.AsyncMock`）；`sync_to_async` 桥接函数直接调用同步实现验证落库 |
| Celery 任务 | `crawl_jm_task` album/photo 两路径、进度上报、失败状态 | `CELERY_TASK_ALWAYS_EAGER=True` 同步执行 + mock jm 客户端 |
| API 层 | 4.2 全部端点的 200/400/401/404/405 | DRF `APIClient` + `force_authenticate`；临时 `MEDIA_ROOT`（`tmp_path` + `settings` fixture）隔离文件操作 |
| 集成冒烟 | 注册→登录→提交爬取→查任务状态 | 标记 `@pytest.mark.slow`，CI 可选跑 |

### 4.3 关键 fixtures（conftest.py）

- `api_client`：DRF `APIClient` 实例。
- `auth_client`：已登录（JWT 直接 `force_authenticate`）。
- `tmp_media_root`：`settings.MEDIA_ROOT` 指向 `tmp_path`，测试后自动清理。
- `mock_jm_async_client`：`AsyncMock` 版异步客户端，预置 `get_album_detail` / `get_photo_detail` / `search_site` 返回的 jmcomic 实体样例（按 `docs/plan.md` 5.4 字段构造）。
- 禁用真实网络：全局 autouse fixture 拦截 `socket`（或仅用 mock 约定，禁止测试命中 jmcomic 真实站点）。

### 4.4 覆盖率门禁

- 总体行覆盖率 ≥ **70%** 起步，service 层（`comic/services/`）≥ **85%**；CI 用 `--cov-fail-under=70` 强制执行，后续逐步上调。
- 新 PR 修改的文件必须有对应测试（code review 人工把关）。

### 4.5 CI 流水线（最终形态）

```
lint job:     uv sync --locked → ruff check → ruff format --check
test job:     uv sync --locked → pytest --cov --cov-fail-under=70（起 Redis service）
django job:   manage.py check + makemigrations --check --dry-run + migrate + collectstatic
frontend job: npm ci → eslint → tsc --noEmit → vite build
docker job:   构建镜像 + compose config + 启动冒烟（现状保留）
```

---

## 5. 执行顺序（与 plan.md 阶段 0 对应）

1. `uv init` 思路落地 `pyproject.toml`，`uv add` 迁移现有依赖 → `uv lock` → 验证 `uv run python manage.py check`。
2. 配置 Ruff → `ruff check --fix` + `ruff format` 一次性整改存量 → 单独提交（纯格式化 commit，便于 review）。
3. 落地 `LOGGING` 配置 → 替换全部 `print` → Ruff `select` 加入 `T201` 防回退。
4. 配置 pre-commit → 全员 `pre-commit install`。
5. 建立 `tests/` + pytest 配置 → 先写纯函数测试让 CI 转绿 → 后续每阶段补对应测试。
6. 更新 Dockerfile / ci.yml / docker-compose 日志卷。
