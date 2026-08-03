"""jm_async 异步客户端封装测试（2.4）。

覆盖：四类异常映射、全局单例客户端（懒初始化 + 启动预热）、
Semaphore 并发限流、下载函数。client 全部 mock，不触达真实站点。
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


@pytest.fixture
def fake_client(monkeypatch):
    """注入预创建的全局客户端，绕过懒初始化。"""
    client = MagicMock()
    monkeypatch.setattr(jm_async, "_client", client)
    return client


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

    async def test_fetch_album_detail_maps_to_jm_async_error(self, fake_client):
        fake_client.get_album_detail = AsyncMock(
            side_effect=MissingAlbumPhotoException("not found", {})
        )
        with pytest.raises(JmAsyncError):
            await jm_async.fetch_album_detail("999")

    async def test_non_jm_exception_propagates(self, fake_client):
        fake_client.get_album_detail = AsyncMock(side_effect=ValueError("boom"))
        with pytest.raises(ValueError):
            await jm_async.fetch_album_detail("999")


class TestQueryFunctions:
    async def test_fetch_album_detail(self, fake_client):
        fake_client.get_album_detail = AsyncMock(return_value="album")
        assert await jm_async.fetch_album_detail("1") == "album"
        fake_client.get_album_detail.assert_awaited_once_with("1")

    async def test_fetch_photo_detail(self, fake_client):
        fake_client.get_photo_detail = AsyncMock(return_value="photo")
        assert await jm_async.fetch_photo_detail("2", True) == "photo"
        fake_client.get_photo_detail.assert_awaited_once_with("2", True)

    async def test_search_site(self, fake_client):
        fake_client.search_site = AsyncMock(return_value="page")
        assert await jm_async.search_site("q", 3) == "page"
        fake_client.search_site.assert_awaited_once_with(search_query="q", page=3)

    async def test_search_tag(self, fake_client):
        fake_client.search_tag = AsyncMock(return_value="page")
        assert await jm_async.search_tag("t", 1) == "page"
        fake_client.search_tag.assert_awaited_once_with(search_query="t", page=1)

    async def test_fetch_photos_concurrent(self, fake_client):
        fake_client.get_photo_detail = AsyncMock(side_effect=lambda pid, _s: f"detail-{pid}")
        result = await jm_async.fetch_photos_concurrent(["1", "2"], max_concurrency=2)
        assert result == {"1": "detail-1", "2": "detail-2"}

    async def test_fetch_photos_concurrent_single_failure(self, fake_client):
        async def get(pid, _s):
            if pid == "bad":
                raise ValueError("boom")
            return f"detail-{pid}"

        fake_client.get_photo_detail = get
        result = await jm_async.fetch_photos_concurrent(["1", "bad"])
        assert result == {"1": "detail-1", "bad": None}


class TestClientLifecycle:
    async def test_get_client_lazy_init_creates_once(self, monkeypatch):
        """懒初始化：首次创建、后续复用（双重检查锁）。"""
        monkeypatch.setattr(jm_async, "_client", None)
        fake_client = MagicMock()
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=fake_client)
        option = MagicMock()
        option.new_jm_async_client = MagicMock(return_value=ctx)

        with patch.object(jm_async.JmOption, "default", return_value=option):
            c1 = await jm_async._get_client()
            c2 = await jm_async._get_client()
        assert c1 is fake_client
        assert c2 is fake_client
        option.new_jm_async_client.assert_called_once()  # 只创建一次

    async def test_get_client_returns_existing(self, fake_client):
        assert await jm_async._get_client() is fake_client

    async def test_init_client_async_warms_up(self, monkeypatch):
        """启动预热：复用 _get_client 创建全局客户端。"""
        monkeypatch.setattr(jm_async, "_client", None)
        with patch.object(jm_async, "_get_client", AsyncMock(return_value=MagicMock())) as m:
            await jm_async.init_client_async()
        m.assert_awaited_once()

    async def test_init_client_async_swallows_error(self, monkeypatch):
        """预热失败只记日志，不抛出（首次使用时兜底重建）。"""
        monkeypatch.setattr(jm_async, "_client", None)
        with patch.object(
            jm_async, "_get_client", AsyncMock(side_effect=RuntimeError("offline"))
        ):
            await jm_async.init_client_async()  # 不应抛出

    def test_init_client_submits_to_background_loop(self):
        """init_client 提交协程到后台循环后立即返回。"""
        with patch.object(jm_async.asyncio, "run_coroutine_threadsafe") as m:
            jm_async.init_client()
        m.assert_called_once()
        coro, loop = m.call_args[0]
        assert loop is jm_async._loop
        coro.close()  # 清理未执行的协程


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

    async def test_download_album_cover_maps_exception(self):
        client = MagicMock()
        client.get_jm_image = AsyncMock(side_effect=RequestRetryAllFailException("fail", {}))
        with pytest.raises(JmAsyncError):
            await jm_async.download_album_cover(client, "123", "/tmp/cover.png")

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
