"""jmcomic 查询封装（同步桥接层）。

本模块是 views/search/library/crawl 服务访问 jmcomic 的唯一入口，
视图层不直接 import jmcomic（见 docs/design.md 3 分层约束）。

所有查询经 jm_async.run_on_loop() 提交到后台事件循环，
复用全局单例客户端（避免每次请求 TCP + TLS 建连）。
纯计算函数（封面 URL / 反混淆序号）保持同步，无需网络。
"""

from jmcomic import JmcomicText, JmImageTool

from . import jm_async
from .jm_async import run_on_loop


def fetch_album_detail(album_id: str):
    """获取本子详情（JmAlbumDetail）。"""
    return run_on_loop(jm_async.fetch_album_detail(album_id))


def fetch_photo_detail(photo_id: str, fetch_scramble_id: bool = False):
    """获取章节详情（JmPhotoDetail）。"""
    return run_on_loop(jm_async.fetch_photo_detail(photo_id, fetch_scramble_id))


def fetch_photos_concurrent(photo_ids: list[str], max_concurrency: int = 6) -> dict:
    """并发获取多个章节详情（复用全局客户端，Semaphore 限流）。

    返回 {photo_id: photo_detail | None}。
    """
    return run_on_loop(jm_async.fetch_photos_concurrent(photo_ids, max_concurrency))


def search_site(query: str, page: int = 1):
    """关键字搜索（JmSearchPage）。"""
    return run_on_loop(jm_async.search_site(query, page))


def search_tag(query: str, page: int = 1):
    """标签搜索（JmSearchPage）。"""
    return run_on_loop(jm_async.search_tag(query, page))


def fetch_album_comments(album_id: str, page: int = 1):
    """获取本子评论分页（JmAlbumCommentPage，含嵌套 replies）。"""
    return run_on_loop(jm_async.fetch_album_comments(album_id, page))


def get_album_cover_url(album_id: str) -> str:
    """封面 URL（纯计算，无网络请求）。"""
    return JmcomicText.get_album_cover_url(album_id)


def get_num_by_url(scramble_id, img_url: str) -> int:
    """阅读页反混淆序号（纯计算，无网络请求）。"""
    return JmImageTool.get_num_by_url(scramble_id, img_url)
