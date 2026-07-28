"""jm_async 异步客户端封装测试（2.4）。

覆盖：四类异常映射、Semaphore 并发限流、下载/查询函数、客户端上下文。
client 全部 mock，不触达真实站点。
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from comic.services import jm_async
from comic.services.jm_async import JmAsyncError
from jmcomic import (
    JmcomicException,
    JsonResolveFailException,
    MissingAlbumPhotoException,
    RequestRetryAllFailException,
)


class FakeImage:
    def __init__(self, filename, scramble_id="220980"):
        self.filename = filename
        self.download_url = f"http://img/{filename}"
        self.scramble_id = scramble_id


TRANSFER_CALLS = []


class FakeImageResp:
    def transfer_to(self, path, scramble_id, decode_image=True, img_url=None):
        TRANSFER_CALLS.append((path, scramble_id, decode_image, img_url))


@pytest.fixture(autouse=True)
def _clear_transfer_calls():
    TRANSFER_CALLS.clear()
    yield
    TRANSFER_CALLS.clear()


class TestExceptionMapping:
    def test_missing_album(self):
        exc = MissingAlbumPhotoException("not found", {})
        mapped = jm_async.map_jm_exception(exc)
        assert isinstance(mapped, JmAsyncError)
        assert "ID 不存在" in str(mapped)
        assert mapped.original is exc

    def test_retry_all_fail(self):
        mapped = jm_async.map_jm_exception(RequestRetryAllFailException("retry", {}))
        assert "重试耗尽" in str(mapped)

    def test_json_resolve_fail(self):
        mapped = jm_async.map_jm_exception(JsonResolveFailException("parse", {}))
        assert "解析失败" in str(mapped)

    def test_generic_jmcomic(self):
        mapped = jm_async.map_jm_exception(JmcomicException("other", {}))
        assert "jmcomic 错误" in str(mapped)

    async def test_fetch_album_detail_maps_to_jm_async_error(self):
        client = MagicMock()
        client.get_album_detail = AsyncMock(side_effect=MissingAlbumPhotoException("not found", {}))
        with pytest.raises(JmAsyncError):
            await jm_async.fetch_album_detail(client, "999")

    async def test_non_jm_exception_propagates(self):
        client = MagicMock()
        client.get_album_detail = AsyncMock(side_effect=ValueError("boom"))
        with pytest.raises(ValueError):
            await jm_async.fetch_album_detail(client, "999")


class TestQueryFunctions:
    async def test_fetch_album_detail(self):
        client = MagicMock()
        client.get_album_detail = AsyncMock(return_value="album")
        assert await jm_async.fetch_album_detail(client, "1") == "album"
        client.get_album_detail.assert_awaited_once_with("1")

    async def test_fetch_photo_detail(self):
        client = MagicMock()
        client.get_photo_detail = AsyncMock(return_value="photo")
        assert await jm_async.fetch_photo_detail(client, "2", True) == "photo"
        client.get_photo_detail.assert_awaited_once_with("2", True)

    async def test_search_site(self):
        client = MagicMock()
        client.search_site = AsyncMock(return_value="page")
        assert await jm_async.search_site(client, "q", 3) == "page"
        client.search_site.assert_awaited_once_with(search_query="q", page=3)

    async def test_search_tag(self):
        client = MagicMock()
        client.search_tag = AsyncMock(return_value="page")
        assert await jm_async.search_tag(client, "t", 1) == "page"
        client.search_tag.assert_awaited_once_with(search_query="t", page=1)


class TestDownload:
    async def test_download_album_cover_no_decode(self):
        client = MagicMock()
        client.get_jm_image = AsyncMock(return_value=FakeImageResp())
        await jm_async.download_album_cover(client, "123", "/tmp/cover.png")
        assert len(TRANSFER_CALLS) == 1
        path, scramble_id, decode, _url = TRANSFER_CALLS[0]
        assert path == "/tmp/cover.png"
        assert scramble_id is None
        assert decode is False

    async def test_download_photo_images_decodes(self):
        client = MagicMock()
        client.get_jm_image = AsyncMock(return_value=FakeImageResp())
        images = [FakeImage("1.jpg"), FakeImage("2.jpg")]
        count = await jm_async.download_photo_images(client, images, "/tmp/ch", max_concurrency=5)
        assert count == 2
        assert len(TRANSFER_CALLS) == 2
        assert TRANSFER_CALLS[0][1] == 220980  # scramble_id
        assert TRANSFER_CALLS[0][2] is True  # decode_image

    async def test_download_concurrency_limited_by_semaphore(self):
        peak = 0
        current = 0
        lock = asyncio.Lock()

        async def fake_get_jm_image(url):
            nonlocal peak, current
            async with lock:
                current += 1
                peak = max(peak, current)
            await asyncio.sleep(0.02)
            async with lock:
                current -= 1
            return FakeImageResp()

        client = MagicMock()
        client.get_jm_image = fake_get_jm_image
        images = [FakeImage(f"{i}.jpg") for i in range(12)]
        await jm_async.download_photo_images(client, images, "/tmp", max_concurrency=3)
        assert peak <= 3
        assert peak >= 2  # 确实发生了并发

    async def test_single_image_failure_continues(self):
        async def fake_get_jm_image(url):
            if "bad" in url:
                raise RequestRetryAllFailException("fail", {})
            return FakeImageResp()

        client = MagicMock()
        client.get_jm_image = fake_get_jm_image
        images = [FakeImage("good.jpg"), FakeImage("bad.jpg")]
        count = await jm_async.download_photo_images(client, images, "/tmp", max_concurrency=2)
        assert count == 1  # 一张失败、一张成功，不中断整章


class TestClientContext:
    async def test_async_jm_client_yields_and_closes(self):
        fake_client = MagicMock()
        fake_client.__aenter__ = AsyncMock(return_value=fake_client)
        fake_client.__aexit__ = AsyncMock(return_value=None)
        fake_option = MagicMock()
        fake_option.new_jm_async_client = MagicMock(return_value=fake_client)

        with patch.object(jm_async.JmOption, "default", return_value=fake_option):
            async with jm_async.async_jm_client() as cl:
                assert cl is fake_client
        fake_client.__aexit__.assert_awaited()
