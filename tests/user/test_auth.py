"""认证 API 测试：register / token / refresh / logout。

验收对应 dev-plan 1.2：
- 错误密钥注册 400；
- 正确注册返 JWT；
- token 刷新旋转且旧 refresh 拉黑。
"""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()

pytestmark = pytest.mark.django_db

REGISTER_URL = reverse("register")
TOKEN_URL = reverse("token_obtain_pair")
REFRESH_URL = reverse("token_refresh")
LOGOUT_URL = reverse("logout")

# 与 pyproject.toml [tool.pytest.ini_options] env 注入的 REGISTRATION_SECRET_KEY 一致
SECRET = "test-registration-key"
PASSWORD = "Str0ngPass!23"


@pytest.fixture
def register_payload():
    return {
        "username": "newuser",
        "password": PASSWORD,
        "password2": PASSWORD,
        "secret_key": SECRET,
    }


def _obtain_tokens(api_client, username="alice", password=PASSWORD):
    resp = api_client.post(TOKEN_URL, {"username": username, "password": password}, format="json")
    assert resp.status_code == 200
    return resp.data["access"], resp.data["refresh"]


class TestRegister:
    def test_register_success_returns_jwt(self, api_client, register_payload):
        resp = api_client.post(REGISTER_URL, register_payload, format="json")
        assert resp.status_code == 201
        assert "access" in resp.data
        assert "refresh" in resp.data
        assert resp.data["username"] == "newuser"
        assert User.objects.filter(username="newuser").exists()

    def test_register_wrong_secret_key(self, api_client, register_payload):
        register_payload["secret_key"] = "wrong-key"
        resp = api_client.post(REGISTER_URL, register_payload, format="json")
        assert resp.status_code == 400
        assert "secret_key" in resp.data
        assert not User.objects.filter(username="newuser").exists()

    def test_register_password_mismatch(self, api_client, register_payload):
        register_payload["password2"] = "Different1!xyz"
        resp = api_client.post(REGISTER_URL, register_payload, format="json")
        assert resp.status_code == 400
        assert "password2" in resp.data

    def test_register_duplicate_username(self, api_client, register_payload, user):
        register_payload["username"] = user.username
        resp = api_client.post(REGISTER_URL, register_payload, format="json")
        assert resp.status_code == 400
        assert "username" in resp.data


class TestToken:
    def test_token_obtain_success(self, api_client, user):
        access, refresh = _obtain_tokens(api_client)
        assert access
        assert refresh

    def test_token_obtain_wrong_password(self, api_client, user):
        resp = api_client.post(TOKEN_URL, {"username": "alice", "password": "wrong"}, format="json")
        assert resp.status_code == 401

    def test_refresh_rotates_and_blacklists_old(self, api_client, user):
        _access, old_refresh = _obtain_tokens(api_client)
        # 刷新：返回新 access + 旋转后的新 refresh
        resp = api_client.post(REFRESH_URL, {"refresh": old_refresh}, format="json")
        assert resp.status_code == 200
        assert "access" in resp.data
        new_refresh = resp.data["refresh"]
        assert new_refresh != old_refresh
        # 旧 refresh 已被拉黑，再次使用应失败
        resp_again = api_client.post(REFRESH_URL, {"refresh": old_refresh}, format="json")
        assert resp_again.status_code == 401


class TestLogout:
    def test_logout_requires_auth(self, api_client):
        resp = api_client.post(LOGOUT_URL, {}, format="json")
        assert resp.status_code == 401

    def test_logout_blacklists_refresh(self, api_client, user):
        access, refresh = _obtain_tokens(api_client)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = api_client.post(LOGOUT_URL, {"refresh": refresh}, format="json")
        assert resp.status_code == 205
        # refresh 已拉黑，无法再刷新
        resp_refresh = api_client.post(REFRESH_URL, {"refresh": refresh}, format="json")
        assert resp_refresh.status_code == 401

    def test_logout_missing_refresh(self, api_client, user):
        access, _refresh = _obtain_tokens(api_client)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = api_client.post(LOGOUT_URL, {}, format="json")
        assert resp.status_code == 400
