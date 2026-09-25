"""开发环境配置。

本地通过 manage.py / wsgi.py / asgi.py 的缺省值使用本模块：
``DJANGO_SETTINGS_MODULE=JmWebProject.settings.dev``
"""

from .base import *  # noqa: F403

DEBUG = True
