"""Crawl API 测试（C1-C2）：提交爬取 + 任务状态查询。"""

from unittest.mock import patch

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


class TestCrawlSubmit:
    def test_requires_auth(self, api_client):
        assert api_client.post(reverse("crawl_submit"), {}, format="json").status_code == 401

    def test_submit_album_id(self, auth_client):
        with patch("comic.views.crawl_jm_task") as mock_task:
            mock_task.delay.return_value.id = "task-123"
            resp = auth_client.post(reverse("crawl_submit"), {"input": "12345"}, format="json")
        assert resp.status_code == 202
        assert resp.data["task_id"] == "task-123"
        mock_task.delay.assert_called_once_with("album", "12345")

    def test_submit_photo_link(self, auth_client):
        with patch("comic.views.crawl_jm_task") as mock_task:
            mock_task.delay.return_value.id = "t2"
            resp = auth_client.post(
                reverse("crawl_submit"), {"input": "https://x/photo/999"}, format="json"
            )
        assert resp.status_code == 202
        mock_task.delay.assert_called_once_with("photo", "999")

    def test_submit_album_link(self, auth_client):
        with patch("comic.views.crawl_jm_task") as mock_task:
            mock_task.delay.return_value.id = "t3"
            auth_client.post(
                reverse("crawl_submit"), {"input": "https://x/album/888"}, format="json"
            )
        mock_task.delay.assert_called_once_with("album", "888")

    def test_submit_invalid_input(self, auth_client):
        resp = auth_client.post(reverse("crawl_submit"), {"input": "invalid"}, format="json")
        assert resp.status_code == 400

    def test_submit_blank_input(self, auth_client):
        resp = auth_client.post(reverse("crawl_submit"), {"input": ""}, format="json")
        assert resp.status_code == 400


class TestCrawlTaskStatus:
    def test_requires_auth(self, api_client):
        assert api_client.get(reverse("crawl_task_status", args=["t"])).status_code == 401

    def test_progress_state(self, auth_client):
        fake = type("R", (), {"state": "PROGRESS", "info": {"current": 1, "total": 10}})()
        with patch("comic.views.AsyncResult", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.status_code == 200
        assert resp.data["state"] == "PROGRESS"
        assert resp.data["progress"]["current"] == 1

    def test_success_state(self, auth_client):
        fake = type("R", (), {"state": "SUCCESS", "result": "done"})()
        with patch("comic.views.AsyncResult", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.data["result"] == "done"

    def test_failure_state(self, auth_client):
        fake = type("R", (), {"state": "FAILURE", "info": "boom"})()
        with patch("comic.views.AsyncResult", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.data["error"] == "boom"

    def test_pending_state(self, auth_client):
        fake = type("R", (), {"state": "PENDING"})()
        with patch("comic.views.AsyncResult", return_value=fake):
            resp = auth_client.get(reverse("crawl_task_status", args=["t1"]))
        assert resp.data["state"] == "PENDING"
        assert "progress" not in resp.data
