"""jm_sync 查询桥接测试（2.3/2.4）：验证 async_to_sync 桥接 jm_async 异步客户端。

网络层 jm_async 全部 mock，仅验证同步桥接与纯计算函数。
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from comic.services import jm_async, jm_sync


@asynccontextmanager
async def _fake_client():
    yield MagicMock()


class TestSyncBridge:
    def test_fetch_album_detail(self):
        with (
            patch.object(jm_async, "async_jm_client", _fake_client),
            patch.object(jm_async, "fetch_album_detail", AsyncMock(return_value="album")) as m,
        ):
            assert jm_sync.fetch_album_detail("123") == "album"
        m.assert_awaited_once()

    def test_fetch_photo_detail(self):
        with (
            patch.object(jm_async, "async_jm_client", _fake_client),
            patch.object(jm_async, "fetch_photo_detail", AsyncMock(return_value="photo")) as m,
        ):
            assert jm_sync.fetch_photo_detail("456", True) == "photo"
        m.assert_awaited_once()

    def test_search_site(self):
        with (
            patch.object(jm_async, "async_jm_client", _fake_client),
            patch.object(jm_async, "search_site", AsyncMock(return_value="page")) as m,
        ):
            assert jm_sync.search_site("q", 2) == "page"
        m.assert_awaited_once()

    def test_search_tag(self):
        with (
            patch.object(jm_async, "async_jm_client", _fake_client),
            patch.object(jm_async, "search_tag", AsyncMock(return_value="page")) as m,
        ):
            assert jm_sync.search_tag("t", 1) == "page"
        m.assert_awaited_once()


class TestPureCompute:
    def test_get_album_cover_url(self):
        url = jm_sync.get_album_cover_url("123")
        assert "123" in url

    def test_get_num_by_url_returns_int(self):
        num = jm_sync.get_num_by_url("220980", "https://cdn.example.com/media/photos/123/00001.jpg")
        assert isinstance(num, int)
