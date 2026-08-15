"""Profile API 测试：JM 账号关联与收藏夹。"""

import json
from unittest.mock import patch

import pytest
from comic.models import LinkedJmAccount
from django.urls import reverse

pytestmark = pytest.mark.django_db


def _login_resp(info=None):
    info = info or {
        "uid": "123",
        "username": "pjm314159",
        "email": "a@b.com",
        "level_name": "聖騎士",
        "album_favorites": 39,
        "coin": "170",
    }
    return type("Resp", (), {"decoded_data": json.dumps(info)})()


class FakeFavoritePage:
    def __init__(self, items, folders, total=39, page_count=2):
        self._items = items
        self._folders = folders
        self.total = total
        self.page_count = page_count

    def iter_id_title(self):
        yield from self._items

    def iter_folder_id_name(self):
        yield from self._folders


class TestProfileApi:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("profile")).status_code == 401
        assert api_client.get(reverse("profile_favorites")).status_code == 401

    def test_get_profile_unlinked(self, auth_client):
        resp = auth_client.get(reverse("profile"))
        assert resp.status_code == 200
        assert resp.data == {"linked": False, "account": None}

    def test_link_account(self, auth_client):
        with patch("comic.services.profile.jm_sync.login", return_value=_login_resp()) as m:
            resp = auth_client.post(
                reverse("profile_link"),
                {"username": "pjm314159", "password": "secret"},
                format="json",
            )
        assert resp.status_code == 200
        assert resp.data["account"]["username"] == "pjm314159"
        assert resp.data["account"]["album_favorites"] == 39
        m.assert_called_once_with("pjm314159", "secret")
        assert LinkedJmAccount.objects.count() == 1

    def test_link_account_rejects_bad_credentials(self, auth_client):
        from comic.services.jm_async import JmAsyncError

        with patch(
            "comic.services.profile.jm_sync.login",
            side_effect=JmAsyncError("网络请求重试耗尽: 登录失败"),
        ):
            resp = auth_client.post(
                reverse("profile_link"),
                {"username": "x", "password": "y"},
                format="json",
            )
        assert resp.status_code == 400
        assert "登录失败" in resp.data["error"]
        assert LinkedJmAccount.objects.count() == 0

    def test_favorites_requires_link(self, auth_client):
        resp = auth_client.get(reverse("profile_favorites"))
        assert resp.status_code == 400
        assert "尚未关联" in resp.data["error"]

    def test_favorites_linked(self, auth_client, user):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(
            user=user,
            username="u",
            password=profile_service._encrypt_password("p"),
            account_info={"uid": "1"},
        )
        page = FakeFavoritePage(
            [("111", "A"), ("222", "B")],
            [("0", "默认收藏夹")],
            total=2,
            page_count=1,
        )
        with (
            patch("comic.services.profile.jm_sync.current_username", return_value=None),
            patch("comic.services.profile.jm_sync.login"),
            patch("comic.services.profile.jm_sync.favorite_folder", return_value=page),
        ):
            resp = auth_client.get(reverse("profile_favorites"))
        assert resp.status_code == 200
        assert resp.data["current"] == 1
        assert resp.data["total"] == 2
        assert resp.data["has_next"] is False
        assert [a["album_id"] for a in resp.data["albums"]] == ["111", "222"]
        assert [a["title"] for a in resp.data["albums"]] == ["A", "B"]
        assert all("cover_url" in a for a in resp.data["albums"])
        assert all(a["is_downloaded"] is False for a in resp.data["albums"])

    def test_favorites_passes_page(self, auth_client, user):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(
            user=user,
            username="u",
            password=profile_service._encrypt_password("p"),
            account_info={"uid": "1"},
        )
        page = FakeFavoritePage([("111", "A")], [], total=1, page_count=1)
        with (
            patch("comic.services.profile.jm_sync.current_username", return_value=None),
            patch("comic.services.profile.jm_sync.login"),
            patch("comic.services.profile.jm_sync.favorite_folder", return_value=page),
        ):
            resp = auth_client.get(reverse("profile_favorites"), {"page": "2"})
        assert resp.status_code == 200
        assert resp.data["current"] == 2


class TestProfileService:
    def test_fetch_favorites_paginates_locally(self, user):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(
            user=user,
            username="u",
            password=profile_service._encrypt_password("p"),
            account_info={"uid": "1"},
        )
        page1_items = [(str(i), f"标题{i}") for i in range(20)]
        page2_items = [(str(i), f"标题{i}") for i in range(20, 25)]
        with (
            patch("comic.services.profile.jm_sync.current_username", return_value=None),
            patch("comic.services.profile.jm_sync.login"),
            patch(
                "comic.services.profile.jm_sync.favorite_folder",
                side_effect=[
                    FakeFavoritePage(page1_items, [], total=25, page_count=2),
                    FakeFavoritePage(page2_items, [], total=25, page_count=2),
                ],
            ),
        ):
            p1 = profile_service.fetch_favorites(user, page=1)
            p2 = profile_service.fetch_favorites(user, page=2)
        assert p1["page_count"] == 2
        assert p1["has_next"] is True
        assert len(p1["albums"]) == 20
        assert [a["album_id"] for a in p2["albums"]] == [str(i) for i in range(20, 25)]
        assert p2["has_prev"] is True
        assert p2["has_next"] is False

    def test_fetch_favorites_skips_login_when_already_logged_in(self, user):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(
            user=user,
            username="u",
            password=profile_service._encrypt_password("p"),
            account_info={"uid": "1"},
        )
        page = FakeFavoritePage([("111", "A")], [], total=1, page_count=1)
        with (
            patch("comic.services.profile.jm_sync.current_username", return_value="u"),
            patch("comic.services.profile.jm_sync.login") as m,
            patch("comic.services.profile.jm_sync.favorite_folder", return_value=page),
        ):
            data = profile_service.fetch_favorites(user)
        m.assert_not_called()
        assert [a["album_id"] for a in data["albums"]] == ["111"]

    def test_favorites_marks_downloaded(self, user, album, photo):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(
            user=user,
            username="u",
            password=profile_service._encrypt_password("p"),
            account_info={"uid": "1"},
        )
        page = FakeFavoritePage([(album.jm_id, "A")], [], total=1, page_count=1)
        with (
            patch("comic.services.profile.jm_sync.current_username", return_value=None),
            patch("comic.services.profile.jm_sync.login"),
            patch("comic.services.profile.jm_sync.favorite_folder", return_value=page),
        ):
            data = profile_service.fetch_favorites(user)
        assert data["albums"][0]["is_downloaded"] is True

    def test_unlink(self, user):
        from comic.services import profile as profile_service

        LinkedJmAccount.objects.create(user=user, username="u", password="x", account_info={})
        profile_service.unlink_account(user)
        assert LinkedJmAccount.objects.count() == 0
