# jmcomic 域名切换相关 API 调研

> 目标：为项目实现「切换域名」功能整理 jmcomic 库提供的全部相关 API。
> 资料来源：官方文档 https://jmcomic.readthedocs.io/zh-cn/latest/api/client/ + 本地 `.venv` 安装的 jmcomic 源码核对。
> 项目现状：Python 侧使用 `JmOption.default().new_jm_async_client()`，默认 impl = `api`（移动端 APP 接口），
> 全局单例 `AsyncJmApiClient` 见 `JmWebProject/comic/services/jm_async.py`。HTTP 下载已移交 Rust 微服务，
> 本文档仅覆盖 Python/jmcomic 查询链路（搜索、详情等）。

---

## 1. 内置域名轮换机制（已自动生效）

jmcomic 的 `AbstractJmClient.request_with_retry()` 本身就带域名轮换：

```
请求失败 → 同域名重试 retry_times 次（默认 5）
        → 仍失败则切换 domain_list 中下一个域名，重试计数清零
        → 所有域名耗尽 → fallback() 抛出 RequestRetryAllFailException
```

要点：

- 域名列表顺序即使用顺序：先用第一个，重试耗尽再换下一个。
- **图片 URL 不参与域名切换**：URL 自带域名时（如 `cdn-msp.xxx`）直接请求，仅 path 形式（`/album/xxx`）才拼域名。
- 移动端 API 客户端初始化时会自动执行 `auto_update_domain()`（受
  `JmModuleConfig.FLAG_API_CLIENT_AUTO_UPDATE_DOMAIN = True` 控制），
  即项目当前的全局客户端在启动预热阶段就会去中心域名服务器刷新域名列表。

## 2. 客户端实例层 API（核心）

| API | 签名 | 说明 |
| --- | --- | --- |
| `get_domain_list()` | `client.get_domain_list() -> List[str]` | 获取当前客户端的域名列表 |
| `set_domain_list()` | `client.set_domain_list(domain_list: List[str])` | **运行时替换域名列表**（手动切换的入口） |
| `auto_update_domain()` | `await client.auto_update_domain()`（仅 API 客户端） | 查询中心域名服务器下发的配置，动态刷新可用 API 域名列表 |
| `update_old_api_domain()` | `client.update_old_api_domain(new_server_list)`（内部方法） | 用新列表替换 `_domain_list`；**仅当当前列表仍等于内置默认 `DOMAIN_API_LIST` 时才替换**（避免覆盖用户自定义配置） |
| `get_html_domain()` | `client.get_html_domain() -> str` | 访问禁漫跳转链接，解析出**一个**当前可用的最新网页域名并设为模块默认 |
| `get_html_domain_all()` | `client.get_html_domain_all() -> List[str]` | 访问禁漫发布页，得到**全部**网页域名（最后一个为 APP 下载页，需剔除） |
| `of_api_url()` | `client.of_api_url(api_path, domain) -> str` | 用指定域名拼出完整 URL |
| `before_retry()` | `client.before_retry(e, url, retry, domain_index)` | 每次失败即将重试前的拦截回调，可重写做告警/统计 |
| `update_request_with_specify_domain()` | `client.update_request_with_specify_domain(kwargs, domain, is_image)` | 域名切换时更新请求参数（如 headers）的回调，可重写 |

`auto_update_domain()` 内部流程（源码 `jm_async_client.py`）：

```
FLAG_API_CLIENT_AUTO_UPDATE_DOMAIN 关闭 → 直接返回
DOMAIN_API_UPDATED_LIST 已有缓存 → 直接 update_old_api_domain(缓存)
否则依次请求 API_URL_DOMAIN_SERVER_LIST 中的域名服务器地址：
    解密响应 → 取 'Server' 字段 → 缓存到 DOMAIN_API_UPDATED_LIST → update_old_api_domain()
全部失败 → DOMAIN_API_UPDATED_LIST = []（保持内置域名）
```

## 3. 配置层 API（JmOption / jm-option.yml）

### 3.1 yml 静态配置

```yaml
client:
  impl: api          # html=网页端 / api=APP端（APP端不限IP兼容性好）
  retry_times: 5     # 单域名重试次数
  domain:            # 按 impl 分别指定域名列表（dict 结构）
    html:
      - 18comic.vip
      - 18comic.org
    api:
      - www.cdnhjk.net
```

- 域名列表为空/未配置时，由 `JmOption.decide_client_domain()` 自动决定：
  api → `JmModuleConfig.DOMAIN_API_LIST`；html → `DOMAIN_HTML_LIST` 或运行时 `get_html_domain()`。
- 项目当前的 `comic/settings/jm-option.yml` 只是模板注释，**实际代码用 `JmOption.default()`，未加载该文件**。

### 3.2 代码层创建时传入

```python
client = option.new_jm_async_client(
    domain_list=['域名1', '域名2'],   # 直接指定域名列表
    retry_times=5,
    domain_retry_strategy=my_strategy,  # 自定义域名重试策略（见下）
)
```

## 4. 自定义域名策略（domain_retry_strategy）

传入可调用对象后**完全接管**请求重试与域名选择逻辑（`request_with_retry` 直接委托给它）。
官方内置实现 `AdvancedRetryPlugin`（`jm_plugin.py`，plugin_key=`advanced_retry`）策略：

- 多轮轮询域名列表（`retry_rounds`）
- 单域名失败达到 `retry_domain_max_times` 后本轮跳过
- 每轮开始前按**历史失败次数升序排序**（失败多的后置），实现"健康域名优先"

yml 启用方式：

```yaml
plugins:
  - plugin: advanced_retry
    kwargs:
      retry_config:
        retry_domain_max_times: 3
        retry_rounds: 3
```

## 5. 全局配置（JmModuleConfig，可运行时改写）

| 属性 | 当前内置值 | 说明 |
| --- | --- | --- |
| `DOMAIN_API_LIST` | `www.cdnhjk.net` / `www.cdngwc.cc` / `www.cdngwc.net` / `www.cdngwc.club`（随机序） | 移动端 API 默认域名 |
| `DOMAIN_IMAGE_LIST` | `cdn-msp.jmapiproxy1.cc`、`cdn-msp.jmapiproxy2.cc`、`cdn-msp2/3.jmapiproxy2.cc`、`cdn-msp.jmapinodeudzn.net`、`cdn-msp3.jmapinodeudzn.net`（随机序） | 移动端图片 CDN 域名 |
| `DOMAIN_HTML_LIST` | `None`（运行时获取） | 网页端域名列表 |
| `DOMAIN_API_UPDATED_LIST` | `None` | `auto_update_domain()` 的进程级缓存 |
| `API_URL_DOMAIN_SERVER_LIST` | 3 个 `bytepluses.com` 的 `newsvr-2025.txt` 地址 | 中心域名服务器地址 |
| `FLAG_API_CLIENT_AUTO_UPDATE_DOMAIN` | `True` | 是否自动刷新 API 域名 |

相关类方法：

- `JmModuleConfig.get_html_domain(postman=None)`：经跳转链接取最新网页域名
- `JmModuleConfig.get_html_domain_all(postman=None)`：经发布页取全部网页域名（带 `field_cache`，进程内只取一次）

## 6. 与本项目相关的落地要点

1. **查询链路（Python）**：全局单例 `AsyncJmApiClient` 已具备「启动自动刷新 + 失败自动轮换」，
   手动切换域名只需对单例调用 `set_domain_list()` 或再次 `await auto_update_domain()`，无需重建客户端。
2. **注意 `update_old_api_domain` 的守卫**：一旦调用过 `set_domain_list()` 改成自定义列表，
   之后 `auto_update_domain()` 不会再覆盖它（仅当列表仍等于内置默认时才替换）。
3. **下载链路（Rust）**：图片下载在 `rust-downloader` 中实现，域名切换若需覆盖下载，
   需在 Rust 侧另行处理（见 `docs/rust-download.md`），jmcomic API 不影响 Rust 侧。
4. **网页端切换**：如未来从 api 换到 html impl，可用 `get_html_domain_all()` 拉全量列表后 `set_domain_list()`。
