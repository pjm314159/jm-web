"""tasks 异步爬取任务测试（2.4）。

用 Task.apply() 本地同步执行（等价 EAGER），mock jm_async 全部网络层 + Rust httpx 调用。
覆盖：album/photo 两路径成功落库、已下载章节跳过、进度 meta 含 current/total、异常返回。
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from comic import tasks
from comic.models import Album, Photo
from comic.services.jm_async import JmAsyncError

pytestmark = pytest.mark.django_db(transaction=True)


class FakeAlbumDetail:
    name = "测试本子"
    authors = ["作者"]
    tags = ["t"]
    actors = []
    description = "desc"
    episode_list = [("111", "1", "第一章"), ("222", "2", "第二章")]


class FakeImage:
    download_url = "http://img/1.jpg"
    filename = "1.jpg"


class FakePhotoDetail:
    name = "第一章"
    album_id = "12345"
    page_arr = ["1.jpg", "2.jpg"]
    scramble_id = "220980"

    def __iter__(self):
        return iter([FakeImage(), FakeImage()])


@asynccontextmanager
async def fake_client():
    yield MagicMock()


def _make_fake_httpx():
    """构造模拟 httpx.AsyncClient，POST 提交成功，GET 轮询返回 completed。"""
    mock_resp_post = MagicMock()
    mock_resp_post.status_code = 202

    mock_resp_get = MagicMock()
    mock_resp_get.status_code = 200
    mock_resp_get.json.return_value = {"status": "completed", "done": 2, "total": 2}

    mock_http = AsyncMock()
    mock_http.post.return_value = mock_resp_post
    mock_http.get.return_value = mock_resp_get

    @asynccontextmanager
    async def fake_async_client(**kwargs):
        yield mock_http

    return fake_async_client, mock_http


def _patch_jm(album_detail=None, photo_detail=None):
    """mock jm_async 网络层 + httpx Rust 调用，返回 patch 上下文管理器列表。"""
    fake_httpx, _ = _make_fake_httpx()
    return (
        patch.object(tasks.jm_async, "async_jm_client", fake_client),
        patch.object(
            tasks.jm_async,
            "fetch_album_detail",
            AsyncMock(return_value=album_detail or FakeAlbumDetail()),
        ),
        patch.object(
            tasks.jm_async,
            "fetch_photo_detail",
            AsyncMock(return_value=photo_detail or FakePhotoDetail()),
        ),
        patch.object(tasks.jm_async, "download_album_cover", AsyncMock()),
        patch("comic.tasks.httpx.AsyncClient", fake_httpx),
    )


class TestCrawlAlbum:
    def test_success_persists_album_and_photos(self, media_root):
        p1, p2, p3, p4, p5 = _patch_jm()
        with p1, p2, p3, p4, p5:
            result = tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        assert "done" in result
        album = Album.objects.get(jm_id="12345")
        assert album.name == "测试本子"
        assert album.total_episodes == 2
        assert Photo.objects.get(jm_id="111").is_downloaded
        assert Photo.objects.get(jm_id="222").is_downloaded

    def test_skips_already_downloaded(self, media_root):
        # 首次下载两章
        p1, p2, p3, p4, p5 = _patch_jm()
        with p1, p2, p3, p4, p5:
            tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        # 第二次：章节均已下载（断点续传），应全部跳过
        _, mock_http = _make_fake_httpx()
        q1, q2, q3, q4, q5 = _patch_jm()
        with q1, q2, q3, q4, q5:
            tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        # httpx 不应被调用（所有章节已下载，跳过 Rust 提交）
        mock_http.post.assert_not_called()

    def test_progress_meta_has_current_total(self, media_root):
        updates = []

        async def fake_report(task, current, total, photo_id):
            updates.append({"current": current, "total": total, "photo_id": photo_id})

        p1, p2, p3, p4, p5 = _patch_jm()
        with p1, p2, p3, p4, p5, patch.object(tasks, "_report_progress", fake_report):
            tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        assert updates
        assert updates[-1]["current"] == 2
        assert updates[-1]["total"] == 2
        assert "photo_id" in updates[-1]

    def test_jm_error_returns_failure_message(self, media_root):
        with (
            patch.object(tasks.jm_async, "async_jm_client", fake_client),
            patch.object(
                tasks.jm_async,
                "fetch_album_detail",
                AsyncMock(side_effect=JmAsyncError("资源 ID 不存在")),
            ),
        ):
            result = tasks.crawl_jm_task.apply(args=("album", "999")).get()
        assert "失败" in result


class TestCrawlPhoto:
    def test_success_locates_album_and_downloads(self, media_root):
        p1, p2, p3, p4, p5 = _patch_jm()
        with p1, p2, p3, p4, p5:
            result = tasks.crawl_jm_task.apply(args=("photo", "111")).get()
        assert "done" in result
        assert Album.objects.filter(jm_id="12345").exists()  # 从 photo.album_id 定位
        assert Photo.objects.filter(jm_id="111").exists()


class TestScanLocalMediaTask:
    def test_scan_returns_message(self, media_root):
        result = tasks.scan_local_media_task.apply().get()
        assert "completed" in result
