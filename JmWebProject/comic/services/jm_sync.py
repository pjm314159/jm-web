"""jmcomic 查询封装（B3：单例客户端连接池复用）。

本模块是 views/search/library 服务访问 jmcomic 的唯一入口，
视图层不直接 import jmcomic（见 docs/design.md 3 分层约束）。

B3 优化：维护一个常驻后台事件循环 + 单例异步客户端，
所有查询类调用共享同一 TCP/TLS 连接池，省去重复握手（-200~500ms/次）。
Gunicorn 多进程下每进程一个客户端（OK）。
"""

import asyncio
import logging
import threading

from jmcomic import JmcomicText, JmImageTool

from . import jm_async

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# B3: 常驻事件循环 + 单例客户端
# ------------------------------------------------------------------
_loop: asyncio.AbstractEventLoop | None = None
_loop_thread: threading.Thread | None = None
_client = None  # jmcomic async client 实例
_client_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    """B3: 启动常驻后台事件循环（进程内单例）。"""
    global _loop, _loop_thread
    if _loop is not None and _loop.is_running():
        return _loop

    def _run():
        global _loop
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
        _loop.run_forever()

    _loop_thread = threading.Thread(target=_run, daemon=True, name="jm-sync-loop")
    _loop_thread.start()
    # 等待循环就绪
    import time

    for _ in range(100):
        if _loop is not None and _loop.is_running():
            break
        time.sleep(0.01)
    return _loop


def _run_coro(coro):
    """B3: 在常驻循环上执行协程并同步等待结果。"""
    loop = _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result(timeout=60)


async def _get_client():
    """B3: 获取/创建单例异步客户端（连接池复用）。"""
    global _client
    if _client is None:
        from jmcomic import JmOption

        _client = JmOption.default().new_jm_async_client()
        await _client.__aenter__()
    return _client


async def _fetch_album_detail(album_id: str):
    client = await _get_client()
    return await jm_async.fetch_album_detail(client, album_id)


async def _fetch_photo_detail(photo_id: str, fetch_scramble_id: bool):
    client = await _get_client()
    return await jm_async.fetch_photo_detail(client, photo_id, fetch_scramble_id)


async def _search_site(query: str, page: int):
    client = await _get_client()
    return await jm_async.search_site(client, query, page)


async def _search_tag(query: str, page: int):
    client = await _get_client()
    return await jm_async.search_tag(client, query, page)


def fetch_album_detail(album_id: str):
    """获取本子详情（JmAlbumDetail）。"""
    return _run_coro(_fetch_album_detail(album_id))


def fetch_photo_detail(photo_id: str, fetch_scramble_id: bool = False):
    """获取章节详情（JmPhotoDetail）。"""
    return _run_coro(_fetch_photo_detail(photo_id, fetch_scramble_id))


def search_site(query: str, page: int = 1):
    """关键字搜索（JmSearchPage）。"""
    return _run_coro(_search_site(query, page))


def search_tag(query: str, page: int = 1):
    """标签搜索（JmSearchPage）。"""
    return _run_coro(_search_tag(query, page))


def get_album_cover_url(album_id: str) -> str:
    """封面 URL（纯计算，无网络请求）。"""
    return JmcomicText.get_album_cover_url(album_id)


def get_num_by_url(scramble_id, img_url: str) -> int:
    """阅读页反混淆序号（纯计算，无网络请求）。"""
    return JmImageTool.get_num_by_url(scramble_id, img_url)
