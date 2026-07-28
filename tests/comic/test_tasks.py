"""tasks 异步爬取任务测试（2.4）。

用 Task.apply() 本地同步执行（等价 EAGER），mock jm_async 全部网络层。
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


class FakePhotoDetail:
    name = "第一章"
    album_id = "12345"
    page_arr = ["1.jpg", "2.jpg"]

    def __iter__(self):
        return iter([])


@asynccontextmanager
async def fake_client():
    yield MagicMock()


def _patch_jm(download_images=None, album_detail=None, photo_detail=None):
    """mock jm_async 网络层，返回 patch 上下文管理器列表。"""
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
        patch.object(
            tasks.jm_async, "download_photo_images", download_images or AsyncMock(return_value=2)
        ),
    )


class TestCrawlAlbum:
    def test_success_persists_album_and_photos(self, media_root):
        dl = AsyncMock(return_value=2)
        p1, p2, p3, p4, p5 = _patch_jm(download_images=dl)
        with p1, p2, p3, p4, p5:
            result = tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        assert "done" in result
        album = Album.objects.get(jm_id="12345")
        assert album.name == "测试本子"
        assert album.total_episodes == 2
        assert Photo.objects.get(jm_id="111").is_downloaded
        assert Photo.objects.get(jm_id="222").is_downloaded
        assert dl.await_count == 2

    def test_skips_already_downloaded(self, media_root):
        # 首次下载两章
        dl = AsyncMock(return_value=2)
        p1, p2, p3, p4, p5 = _patch_jm(download_images=dl)
        with p1, p2, p3, p4, p5:
            tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        assert dl.await_count == 2
        # 第二次：章节均已下载（断点续传），应全部跳过
        dl2 = AsyncMock(return_value=2)
        q1, q2, q3, q4, q5 = _patch_jm(download_images=dl2)
        with q1, q2, q3, q4, q5:
            tasks.crawl_jm_task.apply(args=("album", "12345")).get()
        assert dl2.await_count == 0

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
        dl = AsyncMock(return_value=2)
        p1, p2, p3, p4, p5 = _patch_jm(download_images=dl)
        with p1, p2, p3, p4, p5:
            result = tasks.crawl_jm_task.apply(args=("photo", "111")).get()
        assert "done" in result
        assert Album.objects.filter(jm_id="12345").exists()  # 从 photo.album_id 定位
        assert Photo.objects.filter(jm_id="111").exists()
        assert dl.await_count == 1


class TestScanLocalMediaTask:
    def test_scan_returns_message(self, media_root):
        result = tasks.scan_local_media_task.apply().get()
        assert "completed" in result
