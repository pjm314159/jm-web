"""生产环境配置。

Docker 镜像内置 ``ENV DJANGO_SETTINGS_MODULE=JmWebProject.settings.prod``，
docker compose 的 web 服务无需额外设置。
"""

import os

from .base import *  # noqa: F403

# 生产环境强制关闭 DEBUG（忽略 DJANGO_DEBUG 环境变量）
DEBUG = False


def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in ("true", "1", "yes")


# ------------------------------------------------------------------
# HTTPS 相关安全配置
# 当前部署（nginx 明文 HTTP :80）下全部默认关闭；
# 启用 HTTPS / 反代终止 TLS 后，在 .env 中打开对应开关。
# ------------------------------------------------------------------

# HTTP → HTTPS 强制跳转
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", False)

# HSTS（仅 HTTPS 部署开启；秒数，0 = 不发送）
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", False)

# Cookie 仅经 HTTPS 传输
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", False)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", False)

# 置于 TLS 终止代理之后时开启（信任 X-Forwarded-Proto）
if _env_bool("SECURE_PROXY_SSL_HEADER", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Referrer 策略
SECURE_REFERRER_POLICY = "same-origin"
