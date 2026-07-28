"""全局 pytest fixtures。

环境变量由 pyproject.toml 的 [tool.pytest.ini_options] env（pytest-env）注入，
确保在 pytest-django 加载 settings 之前生效。
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture(autouse=True)
def _isolated_cache(settings):
    """测试改用本地内存缓存：隔离外部 Redis，避免测试间缓存污染。

    修改 settings.CACHES 会触发 Django setting_changed 信号自动重置缓存连接。
    """
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "jm-test",
        }
    }
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    """未认证的 DRF 测试客户端。"""
    return APIClient()


@pytest.fixture
def user(db):
    """普通测试用户。"""
    return User.objects.create_user(username="alice", password="Str0ngPass!23")


@pytest.fixture
def auth_client(api_client, user):
    """已认证（force_authenticate）的 DRF 测试客户端。"""
    api_client.force_authenticate(user=user)
    return api_client
