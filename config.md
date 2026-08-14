# 配置说明

本文档记录后端可调参数，尤其是 gunicorn 启动参数。修改后需要重新构建/重启容器生效。

## Gunicorn 启动参数

当前容器内后端启动命令（见 `Dockerfile` 的 `CMD`）：

```bash
gunicorn JmWebProject.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 0
```

### 支持的参数

| 参数 | 当前值 | 说明 |
| --- | --- | --- |
| `--bind` | `0.0.0.0:8000` | 监听地址与端口。 |
| `--workers` | `2` | worker 进程数，按 CPU/内存调整。 |
| `--timeout` | `0` | worker 超时秒数。`0` 表示关闭超时（最大），网络不稳定时不会因请求长时间重试而被强杀。 |
| `--graceful-timeout` | 未设置（默认 30） | 优雅停机超时秒数。 |
| `--worker-class` | 未设置（默认 sync） | worker 类型，可改为 `gthread`、`gevent` 等。 |
| `--threads` | 未设置 | 配合 `--worker-class gthread` 使用的每进程线程数。 |
| `--max-requests` | 未设置 | 单 worker 处理多少请求后重启，用于内存泄漏兜底。 |

### 修改方式

直接改 `Dockerfile` 的 `CMD`，或部署时用 `docker-compose.yml` 的 `command` 覆盖。

### 关于 `--timeout`

- `--timeout 0` 表示不限制 worker 超时，是当前配置的最大值。
- 当前 jmcomic 客户端超时/重试保持默认（每次请求最长约 30 秒、重试 5 次、多个 API 域名），最坏情况下单请求可能阻塞数分钟。
- 若希望保留超时保护，可改回有限秒数，建议不低于 `600`，否则网络抖动时仍可能触发 worker 超时。
