"""测试环境配置（pytest / CI）。

由 pytest-django 与 CI 工作流显式指定：
``DJANGO_SETTINGS_MODULE=JmWebProject.settings.test``
"""

from .base import *  # noqa: F403

DEBUG = False

# 密码哈希使用最快算法，显著缩短测试耗时
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# 缓存改用本地内存，测试不依赖 Redis 实例
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "test-cache",
    }
}
