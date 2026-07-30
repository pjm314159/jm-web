"""jmcomic 查询封装（阶段 2：async_to_sync 桥接异步客户端）。

本模块是 views/search/library 服务访问 jmcomic 的唯一入口，
视图层不直接 import jmcomic（见 docs/design.md 3 分层约束）。

阶段 2 起，查询类调用经 asgiref.async_to_sync 桥接 jm_async 异步客户端：
DRF 视图保持同步 def，每次调用新建异步客户端（独立事件循环），
ORM 操作仍留在同步侧，规避 SQLite 异步连接问题（docs/plan.md 4.3）。
纯计算函数（封面 URL / 反混淆序号）保持同步，无需网络。

性能优化：批量操作（如整本下载）复用同一异步客户端，避免逐章建连。
"""

from asgiref.sync import async_to_sync
from jmcomic import JmcomicText, JmImageTool

from . import jm_async


async def _fetch_album_detail(album_id: str):
    async with jm_async.async_jm_client() as client:
        return await jm_async.fetch_album_detail(client, album_id)


async def _fetch_photo_detail(photo_id: str, fetch_scramble_id: bool):
    async with jm_async.async_jm_client() as client:
        return await jm_async.fetch_photo_detail(client, photo_id, fetch_scramble_id)


async def _search_site(query: str, page: int):
    async with jm_async.async_jm_client() as client:
        return await jm_async.search_site(client, query, page)


async def _search_tag(query: str, page: int):
    async with jm_async.async_jm_client() as client:
        return await jm_async.search_tag(client, query, page)


async def _fetch_album_with_photos(album_id: str, photo_ids: list[str]):
    """批量获取本子详情 + 多个章节详情（复用同一客户端连接）。"""
    async with jm_async.async_jm_client() as client:
        album_detail = await jm_async.fetch_album_detail(client, album_id)
        photo_details = {}
        for pid in photo_ids:
            try:
                photo_details[pid] = await jm_async.fetch_photo_detail(client, pid, False)
            except Exception:
                photo_details[pid] = None
        return album_detail, photo_details


def fetch_album_detail(album_id: str):
    """获取本子详情（JmAlbumDetail）。"""
    return async_to_sync(_fetch_album_detail)(album_id)


def fetch_photo_detail(photo_id: str, fetch_scramble_id: bool = False):
    """获取章节详情（JmPhotoDetail）。"""
    return async_to_sync(_fetch_photo_detail)(photo_id, fetch_scramble_id)


def fetch_album_with_photos(album_id: str, photo_ids: list[str]):
    """批量获取本子详情 + 章节详情（单客户端连接复用）。

    返回 (album_detail, {photo_id: photo_detail | None})。
    """
    return async_to_sync(_fetch_album_with_photos)(album_id, photo_ids)


def search_site(query: str, page: int = 1):
    """关键字搜索（JmSearchPage）。"""
    return async_to_sync(_search_site)(query, page)


def search_tag(query: str, page: int = 1):
    """标签搜索（JmSearchPage）。"""
    return async_to_sync(_search_tag)(query, page)


def get_album_cover_url(album_id: str) -> str:
    """封面 URL（纯计算，无网络请求）。"""
    return JmcomicText.get_album_cover_url(album_id)


def get_num_by_url(scramble_id, img_url: str) -> int:
    """阅读页反混淆序号（纯计算，无网络请求）。"""
    return JmImageTool.get_num_by_url(scramble_id, img_url)
