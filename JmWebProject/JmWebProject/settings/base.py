"""公共配置：所有环境共享。

环境差异（DEBUG / 安全头等）见 dev.py / prod.py / test.py。
"""

import os
from datetime import timedelta
from pathlib import Path

from django.db.backends.signals import connection_created
from dotenv import load_dotenv

# 优先读取真实环境变量（Docker/compose/CI 注入），
# 仅当变量缺失时从仓库根目录的 .env 补充（本地开发便利，不会覆盖已有值）
# 注意：settings 拆分为包后本文件深了一层，需向上三级才是 manage.py 所在目录
BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR.parent / ".env", override=False)

# ------------------------------------------------------------------
# 核心安全项：强制由环境变量提供，缺失直接启动失败（fail-fast）
# ------------------------------------------------------------------

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "DJANGO_SECRET_KEY environment variable is required. "
        "Generate one with: python -c "
        '"from django.core.management.utils import get_random_secret_key; '
        'print(get_random_secret_key())"'
    )

# 注册密钥（用户注册时需要输入，防止陌生人注册）
REGISTRATION_SECRET_KEY = os.getenv("REGISTRATION_SECRET_KEY")
if not REGISTRATION_SECRET_KEY:
    raise RuntimeError("REGISTRATION_SECRET_KEY environment variable is required")

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() in ("true", "1", "yes")

# ------------------------------------------------------------------
# 1. 登录模块配置
# ------------------------------------------------------------------
SESSION_COOKIE_AGE = int(os.environ.get("SESSION_COOKIE_AGE", "604800"))
AUTH_USER_MODEL = "user.User"

# ------------------------------------------------------------------
# 2. 媒体文件配置 (用于存储爬取图片)
# ------------------------------------------------------------------
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", os.path.join(BASE_DIR, "media"))

# ------------------------------------------------------------------
# 3. Redis / 下载模块配置
# ------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# 异步爬虫并发控制
JM_DOWNLOAD_IMAGE_CONCURRENCY = int(os.environ.get("JM_DOWNLOAD_IMAGE_CONCURRENCY", "30"))
JM_DOWNLOAD_PHOTO_CONCURRENCY = int(os.environ.get("JM_DOWNLOAD_PHOTO_CONCURRENCY", "3"))
RUST_DOWNLOADER_URL = os.environ.get("RUST_DOWNLOADER_URL", "http://127.0.0.1:3080")
# Rust 下载完成后的回调地址（Docker 内为 http://web:8000）
CRAWL_CALLBACK_URL = os.environ.get("CRAWL_CALLBACK_URL", "http://127.0.0.1:8000")
# 回调接口共享密钥（可选）：配置后 /api/crawl/callback/ 强制校验 X-Internal-Token 头，
# 未配置时不校验（仅限本地开发；生产务必配置）
INTERNAL_CALLBACK_TOKEN = os.environ.get("INTERNAL_CALLBACK_TOKEN", "").strip() or None
# Django→Rust HTTP 请求超时与连接池
RUST_REQUEST_TIMEOUT = int(os.environ.get("RUST_REQUEST_TIMEOUT", "15"))
RUST_HTTP_MAX_CONNECTIONS = int(os.environ.get("RUST_HTTP_MAX_CONNECTIONS", "10"))
RUST_HTTP_MAX_KEEPALIVE = int(os.environ.get("RUST_HTTP_MAX_KEEPALIVE", "5"))
# 下载任务状态缓存过期时间（秒）
CRAWL_STATE_TTL = int(os.environ.get("CRAWL_STATE_TTL", str(3600 * 24)))

# jmcomic 客户端配置
JM_OPTION_TIMEOUT = int(os.environ.get("JM_OPTION_TIMEOUT", "30"))
JM_OPTION_RETRY_TIMES = int(os.environ.get("JM_OPTION_RETRY_TIMES", "5"))
JM_OPTION_DOMAINS = [
    d.strip() for d in os.environ.get("JM_OPTION_DOMAINS", "").split(",") if d.strip()
] or None
# 代理地址（jmcomic 与 Rust 下载服务共用，留空/不设置则不使用代理）
PROXY = os.environ.get("PROXY", "").strip() or None

# 阅读器/搜索分页与缓存 TTL
IMAGES_PER_PAGE = int(os.environ.get("IMAGES_PER_PAGE", "300"))
LIST_PAGE_SIZE = int(os.environ.get("LIST_PAGE_SIZE", "30"))
SEARCH_CACHE_TTL = int(os.environ.get("SEARCH_CACHE_TTL", "120"))
DETAIL_CACHE_TTL = int(os.environ.get("DETAIL_CACHE_TTL", "120"))
COMMENT_CACHE_TTL = int(os.environ.get("COMMENT_CACHE_TTL", "60"))
ANON_THROTTLE_RATE = os.environ.get("ANON_THROTTLE_RATE", "30/min")

# 本地媒体扩展名（逗号分隔，含点）
LOCAL_IMAGE_EXTS = [
    e.strip()
    for e in os.environ.get("LOCAL_IMAGE_EXTS", ".jpg,.jpeg,.png,.webp,.gif,.avif").split(",")
    if e.strip()
]
LOCAL_VIDEO_EXTS = [
    e.strip()
    for e in os.environ.get(
        "LOCAL_VIDEO_EXTS", ".mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v,.mpg,.mpeg"
    ).split(",")
    if e.strip()
]

# ------------------------------------------------------------------
# 5. 缓存配置 (Redis)
# ------------------------------------------------------------------
CACHE_DEFAULT_TIMEOUT = int(os.environ.get("CACHE_DEFAULT_TIMEOUT", "300"))
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
        "KEY_PREFIX": "jmw",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

# Session 使用缓存存储
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"
SESSION_SAVE_EVERY_REQUEST = False

ALLOWED_HOSTS = [os.getenv("ALLOWED_HOST"), "127.0.0.1", "localhost", "web"]

# security
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# ------------------------------------------------------------------
# Application definition
# ------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 第三方：REST API + JWT 认证 + CORS
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    # 业务应用
    "user",
    "comic",
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # 须置于 CommonMiddleware 之前
    "django.middleware.gzip.GZipMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.http.ConditionalGetMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
CSRF_TRUSTED_ORIGINS = os.getenv(
    "CSRF_TRUSTED_ORIGINS", "http://127.0.0.1,http://127.0.0.1:8000"
).split(",")
CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://127.0.0.1,http://127.0.0.1:8000"
).split(",")
CORS_ALLOW_CREDENTIALS = True

# ------------------------------------------------------------------
# Django REST Framework：默认 JWT 鉴权 + 统一分页（30/页，对齐旧版列表）
# ------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": LIST_PAGE_SIZE,
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.AnonRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        "anon": ANON_THROTTLE_RATE,
    },
}

# ------------------------------------------------------------------
# SimpleJWT：access 7d + refresh 7d，旋转 + 拉黑
# 注意：SIGNING_KEY 复用 SECRET_KEY，轮换密钥会使全部登录态失效（设计取舍）
# ------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=7),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}
ROOT_URLCONF = "JmWebProject.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.media",
            ],
        },
    },
]

WSGI_APPLICATION = "JmWebProject.wsgi.application"


# ------------------------------------------------------------------
# Database
# ------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DB_NAME", str(BASE_DIR / "db" / "db.sqlite3")),
        "OPTIONS": {
            "timeout": int(os.environ.get("DB_TIMEOUT", "5")),
        },
        "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
    }
}


# SQLite PRAGMA 优化：通过信号在连接创建时执行
def _set_sqlite_pragma(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        cursor = connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA cache_size=-20000;")
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.execute("PRAGMA temp_store=MEMORY;")


connection_created.connect(_set_sqlite_pragma)


# ------------------------------------------------------------------
# Password validation
# ------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# ------------------------------------------------------------------
# Internationalization
# ------------------------------------------------------------------

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# ------------------------------------------------------------------
# Static files
# ------------------------------------------------------------------

STATIC_URL = "static/"
# 静态文件发布目录：与 docker-compose 中挂载给 nginx 的宿主机目录保持一致
# （web 容器内 collectstatic 写入此目录 → 通过 bind mount 落到宿主机 → nginx 读取）
# 注意：STATIC_ROOT 不能出现在 STATICFILES_DIRS 中
STATIC_ROOT = os.path.join(BASE_DIR, "static")
STATICFILES_DIRS: list[str] = []

# ------------------------------------------------------------------
# 日志配置：控制台 + 按天滚动文件
# ------------------------------------------------------------------
LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO")
LOG_DIR = Path(os.getenv("DJANGO_LOG_DIR", BASE_DIR / "logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {process:d} {thread:d} | {message}",
            "style": "{",
        },
        "simple": {
            "format": "[{asctime}] {levelname} {name} | {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
        "file": {
            "class": "JmWebProject.log_utils.CompressedTimedRotatingFileHandler",
            "filename": LOG_DIR / "jmweb.log",
            "when": "midnight",
            "backupCount": 30,
            "encoding": "utf-8",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django.request": {  # 4xx/5xx 请求日志
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "comic.services.crawl": {
            "handlers": ["console", "file"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "jmcomic": {  # 第三方库降噪
            "level": "WARNING",
        },
    },
}
