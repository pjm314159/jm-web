"""Library API 测试（L1-L5）：列表 / 详情 / 删除 / 检测更新 / 阅读器。"""

from unittest.mock import patch

import pytest
from comic.models import Album, Photo
from django.urls import reverse

pytestmark = pytest.mark.django_db


class TestAlbumList:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("album-list")).status_code == 401

    def test_list_only_downloaded_albums(self, auth_client, album, photo, photo2):
        resp = auth_client.get(reverse("album-list"))
        assert resp.status_code == 200
        assert resp.data["count"] == 1
        item = resp.data["results"][0]
        assert item["jm_id"] == "12345"
        assert item["downloaded_episodes"] == 1
        assert item["cover_url"].endswith("cover.png")

    def test_list_excludes_album_without_downloaded(self, auth_client, album, photo2):
        resp = auth_client.get(reverse("album-list"))
        assert resp.data["count"] == 0


class TestAlbumDetail:
    def test_retrieve(self, auth_client, album, photo):
        resp = auth_client.get(reverse("album-detail", args=[album.id]))
        assert resp.status_code == 200
        assert resp.data["jm_id"] == "12345"
        assert len(resp.data["photos"]) == 1

    def test_retrieve_404(self, auth_client):
        assert auth_client.get(reverse("album-detail", args=[9999])).status_code == 404

    def test_update_not_allowed(self, auth_client, album):
        resp = auth_client.post(reverse("album-detail", args=[album.id]), {})
        assert resp.status_code == 405


class TestAlbumDelete:
    def test_delete_removes_db_and_files(self, auth_client, album, photo, media_root):
        album_dir = media_root / "images" / "jmcomic" / "测试本子"
        (album_dir / "第一章").mkdir(parents=True)
        (album_dir / "第一章" / "1.jpg").write_bytes(b"x")

        resp = auth_client.delete(reverse("album-detail", args=[album.id]))
        assert resp.status_code == 204
        assert not Album.objects.filter(id=album.id).exists()
        assert not Photo.objects.filter(id=photo.id).exists()
        assert not album_dir.exists()

    def test_delete_missing_folder_still_removes_db(self, auth_client, album, media_root):
        resp = auth_client.delete(reverse("album-detail", args=[album.id]))
        assert resp.status_code == 204
        assert not Album.objects.filter(id=album.id).exists()


class TestCheckUpdates:
    def test_requires_auth(self, api_client, album):
        resp = api_client.post(reverse("album-check-updates", args=[album.id]))
        assert resp.status_code == 401

    def test_returns_diff(self, auth_client, album, photo):
        fake_detail = type(
            "D", (), {"episode_list": [("67890", "1", "第一章"), ("99999", "2", "新章节")]}
        )()
        with patch("comic.services.library.jm_sync.fetch_album_detail", return_value=fake_detail):
            resp = auth_client.post(reverse("album-check-updates", args=[album.id]))
        assert resp.status_code == 200
        assert resp.data["has_updates"] is True
        assert resp.data["new_count"] == 1
        assert resp.data["new_episodes"][0]["photo_id"] == "99999"
        album.refresh_from_db()
        assert album.total_episodes == 2

    def test_no_updates(self, auth_client, album, photo):
        fake_detail = type("D", (), {"episode_list": [("67890", "1", "第一章")]})()
        with patch("comic.services.library.jm_sync.fetch_album_detail", return_value=fake_detail):
            resp = auth_client.post(reverse("album-check-updates", args=[album.id]))
        assert resp.data["has_updates"] is False
        assert resp.data["new_count"] == 0

    def test_failed_chapter_counts_as_update(self, auth_client, album, photo, photo2):
        fake_detail = type(
            "D",
            (),
            {"episode_list": [("67890", "1", "第一章"), ("67891", "2", "第二章")]},
        )()
        with patch("comic.services.library.jm_sync.fetch_album_detail", return_value=fake_detail):
            resp = auth_client.post(reverse("album-check-updates", args=[album.id]))
        assert resp.status_code == 200
        assert resp.data["has_updates"] is True
        assert resp.data["new_count"] == 1
        assert resp.data["new_episodes"][0]["photo_id"] == "67891"
        assert resp.data["local_count"] == 1
        assert resp.data["remote_count"] == 2

    def test_remote_error_502(self, auth_client, album):
        with patch(
            "comic.services.library.jm_sync.fetch_album_detail", side_effect=RuntimeError("net")
        ):
            resp = auth_client.post(reverse("album-check-updates", args=[album.id]))
        assert resp.status_code == 502


class TestPhotoReader:
    def test_requires_auth(self, api_client, photo):
        assert api_client.get(reverse("photo_reader", args=[photo.id])).status_code == 401

    def test_reader_natural_sort(self, auth_client, photo, media_root):
        chapter_dir = media_root / "images" / "jmcomic" / "测试本子" / "第一章"
        chapter_dir.mkdir(parents=True)
        for i in [2, 10, 1]:
            (chapter_dir / f"{i}.jpg").write_bytes(b"x")
        resp = auth_client.get(reverse("photo_reader", args=[photo.id]))
        assert resp.status_code == 200
        names = [u.rsplit("/", 1)[-1] for u in resp.data["images"]]
        assert names == ["1.jpg", "2.jpg", "10.jpg"]
        assert resp.data["total_images"] == 3

    def test_reader_navigation(self, auth_client, photo, photo2, media_root):
        resp = auth_client.get(reverse("photo_reader", args=[photo.id]))
        assert resp.data["next_photo_id"] == photo2.id
        assert resp.data["prev_photo_id"] is None

    def test_reader_404(self, auth_client):
        assert auth_client.get(reverse("photo_reader", args=[9999])).status_code == 404
