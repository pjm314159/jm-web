"""Crawl API 测试（C1-C2）：提交爬取 + 任务状态查询。

业务层 crawl_service 全部 mock，不触达真实 Rust 服务或 jmcomic。
"""

from unittest.mock import patch

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


class TestCrawlSubmit:
    def test_requires_auth(self, api_client):
        assert api_client.post(reverse("crawl_submit"), {}, format="json").status_code == 401

    def test_submit_album_id(self, auth_client):
        fake_result = {
            "crawl_id": "abc123",
            "chapters": 2,
            "submitted": 2,
            "message": "已提交 2/2 章",
        }
        with patch("comic.views.crawl_service.submit_crawl", return_value=fake_result) as m:
            resp = auth_client.post(reverse("crawl_submit"), {"input": "12345"}, format="json")
        assert resp.status_code == 202
        assert resp.data["task_id"] == "abc123"
        m.assert_called_once_with("album", "12345")

    def test_submit_photo_link(self, auth_client):
        fake_result = {"crawl_id": "t2", "chapters": 1, "submitted": 1, "message": "已提交"}
        with patch("comic.views.crawl_service.submit_crawl", return_value=fake_result) as m:
            resp = auth_client.post(
                reverse("crawl_submit"), {"input": "https://x/photo/999"}, format="json"
            )
        assert resp.status_code == 202
        m.assert_called_once_with("photo", "999")

    def test_submit_album_link(self, auth_client):
        fake_result = {"crawl_id": "t3", "chapters": 1, "submitted": 1, "message": "已提交"}
        with patch("comic.views.crawl_service.submit_crawl", return_value=fake_result) as m:
            auth_client.post(
                reverse("crawl_submit"), {"input": "https://x/album/888"}, format="json"
            )
        m.assert_called_once_with("album", "888")

    def test_submit_invalid_input(self, auth_client):
        resp = auth_client.post(reverse("crawl_submit"), {"input": "invalid"}, format="json")
        assert resp.status_code == 400

    def test_submit_blank_input(self, auth_client):
        resp = auth_client.post(reverse("crawl_submit"), {"input": ""}, format="json")
        assert resp.status_code == 400

    def test_submit_rust_unreachable(self, auth_client):
        with patch(
            "comic.views.crawl_service.submit_crawl", side_effect=ConnectionError("refused")
        ):
            resp = auth_client.post(reverse("crawl_submit"), {"input": "12345"}, format="json")
        assert resp.status_code == 502


class TestCrawlTaskStatus:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("crawl_task_status", args=["t"])).status_code == 401

    def test_progress_state(self, auth_client):
        fake = {
            "crawl_id": "t1",
            "state": "PROGRESS",
            "progress": {
                "chapters_done": 1,
                "chapters_total": 3,
                "images_done": 20,
                "images_total": 60,
            },
        }
        with patch("comic.views.crawl_service.get_crawl_status", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.status_code == 200
        assert resp.data["state"] == "PROGRESS"
        assert resp.data["progress"]["chapters_done"] == 1

    def test_success_state(self, auth_client):
        fake = {
            "crawl_id": "t1",
            "state": "SUCCESS",
            "progress": {
                "chapters_done": 3,
                "chapters_total": 3,
                "images_done": 60,
                "images_total": 60,
            },
        }
        with patch("comic.views.crawl_service.get_crawl_status", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.data["state"] == "SUCCESS"

    def test_unknown_state(self, auth_client):
        fake = {"crawl_id": "t1", "state": "UNKNOWN", "error": "任务不存在或已过期"}
        with patch("comic.views.crawl_service.get_crawl_status", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.data["state"] == "UNKNOWN"
        assert "error" in resp.data


class TestSubmitPhotoRetry:
    def test_retry_keeps_sort_index(self, album, photo2):
        from comic.services import crawl as crawl_service

        class FakeImage:
            download_url = "https://x/1.jpg"
            filename = "1.jpg"

        class FakePhoto:
            album_id = "12345"
            name = "第二章"
            scramble_id = "220980"

            def __iter__(self):
                return iter([FakeImage()])

        class FakeAlbum:
            name = "测试本子"
            author = "测试作者"
            tags = []
            actors = []
            description = ""
            episode_list = [("67891", "2", "第二章")]

        with (
            patch("comic.services.crawl.jm_sync.fetch_photo_detail", return_value=FakePhoto()),
            patch("comic.services.crawl.jm_sync.fetch_album_detail", return_value=FakeAlbum()),
            patch(
                "comic.services.crawl.jm_sync.get_album_cover_url",
                return_value="https://x/cover.png",
            ),
            patch("comic.services.crawl._submit_to_rust", return_value=True),
        ):
            result = crawl_service._submit_photo("retry123", "67891")

        photo2.refresh_from_db()
        assert result["submitted"] == 1
        assert photo2.sort_index == 2
        assert photo2.is_downloaded is False
        assert photo2.album_id == album.id


class TestUnsafeImageFilenames:
    def test_submit_photo_skips_unsafe_filenames(self, album, photo2):
        from comic.services import crawl as crawl_service

        class FakeImage:
            def __init__(self, filename):
                self.download_url = f"https://x/{filename}"
                self.filename = filename

        class FakePhoto:
            album_id = "12345"
            name = "第二章"
            scramble_id = "220980"

            def __iter__(self):
                return iter(
                    [
                        FakeImage("1.jpg"),
                        FakeImage("../evil.jpg"),
                        FakeImage("2\\x.jpg"),
                        FakeImage(".hidden.jpg"),
                    ]
                )

        class FakeAlbum:
            name = "测试本子"
            author = "测试作者"
            tags = []
            actors = []
            description = ""
            episode_list = [("67891", "2", "第二章")]

        submitted_images = []

        def fake_submit(task_id, save_dir, scramble_id, aid, images):
            submitted_images.extend(images)
            return True

        with (
            patch("comic.services.crawl.jm_sync.fetch_photo_detail", return_value=FakePhoto()),
            patch("comic.services.crawl.jm_sync.fetch_album_detail", return_value=FakeAlbum()),
            patch(
                "comic.services.crawl.jm_sync.get_album_cover_url",
                return_value="https://x/cover.png",
            ),
            patch("comic.services.crawl._submit_to_rust", side_effect=fake_submit),
        ):
            result = crawl_service._submit_photo("retry123", "67891")

        assert result["submitted"] == 1
        assert [img["filename"] for img in submitted_images] == ["1.jpg"]
