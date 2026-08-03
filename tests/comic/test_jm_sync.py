"""jm_sync 查询桥接测试：验证 run_on_loop 桥接全局客户端。

网络层 jm_async 全部 mock，仅验证同步桥接与纯计算函数。
"""

from unittest.mock import AsyncMock, patch

from comic.services import jm_async, jm_sync


class TestSyncBridge:
    def test_fetch_album_detail(self):
        with patch.object(jm_async, "fetch_album_detail", AsyncMock(return_value="album")) as m:
            assert jm_sync.fetch_album_detail("123") == "album"
        m.assert_awaited_once_with("123")

    def test_fetch_photo_detail(self):
        with patch.object(jm_async, "fetch_photo_detail", AsyncMock(return_value="photo")) as m:
            assert jm_sync.fetch_photo_detail("456", True) == "photo"
        m.assert_awaited_once_with("456", True)

    def test_fetch_photos_concurrent(self):
        with patch.object(
            jm_async, "fetch_photos_concurrent", AsyncMock(return_value={"1": "a", "2": "b"})
        ) as m:
            result = jm_sync.fetch_photos_concurrent(["1", "2"])
            assert result == {"1": "a", "2": "b"}
        m.assert_awaited_once_with(["1", "2"], 6)

    def test_search_site(self):
        with patch.object(jm_async, "search_site", AsyncMock(return_value="page")) as m:
            assert jm_sync.search_site("q", 2) == "page"
        m.assert_awaited_once_with("q", 2)

    def test_search_tag(self):
        with patch.object(jm_async, "search_tag", AsyncMock(return_value="page")) as m:
            assert jm_sync.search_tag("t", 1) == "page"
        m.assert_awaited_once_with("t", 1)


class TestPureCompute:
    def test_get_album_cover_url(self):
        url = jm_sync.get_album_cover_url("123")
        assert "123" in url

    def test_get_num_by_url_returns_int(self):
        num = jm_sync.get_num_by_url("220980", "https://cdn.example.com/media/photos/123/00001.jpg")
        assert isinstance(num, int)
