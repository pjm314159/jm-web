"""jmcomic 查询封装（同步桥接层）。

本模块是 views/search/library/crawl 服务访问 jmcomic 的唯一入口，
视图层不直接 import jmcomic（见 docs/design.md 3 分层约束）。

所有查询经 jm_async.run_on_loop() 提交到后台事件循环，
复用全局单例客户端（避免每次请求 TCP + TLS 建连）。
纯计算函数（封面 URL / 反混淆序号）保持同步，无需网络。
"""

import random

from jmcomic import JmcomicText, JmImageTool, JmMagicConstants, JmModuleConfig

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


def search_site(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """关键字搜索（JmSearchPage）。"""
    return run_on_loop(
        jm_async.search_site(
            query, page, order_by=order_by, time=time, category=category, sub_category=sub_category
        )
    )


def search_tag(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """标签搜索（JmSearchPage）。"""
    return run_on_loop(
        jm_async.search_tag(
            query, page, order_by=order_by, time=time, category=category, sub_category=sub_category
        )
    )


def search_author(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """作者搜索（JmSearchPage，与 search_tag 同构）。"""
    return run_on_loop(
        jm_async.search_author(
            query, page, order_by=order_by, time=time, category=category, sub_category=sub_category
        )
    )


def fetch_album_comments(album_id: str, page: int = 1):
    """获取本子评论分页（JmAlbumCommentPage，含嵌套 replies）。"""
    return run_on_loop(jm_async.fetch_album_comments(album_id, page))


def login(username: str, password: str):
    """JM 账号登录（返回 JmApiResp）。"""
    return run_on_loop(jm_async.login(username, password))


def current_username():
    """当前全局客户端已登录的 JM 用户名（未登录返回 None）。"""
    return run_on_loop(jm_async.current_username())


def favorite_folder(page=1, order_by=JmMagicConstants.ORDER_BY_LATEST, folder_id="0"):
    """获取收藏夹分页（JmFavoritePage）。"""
    return run_on_loop(jm_async.favorite_folder(page=page, order_by=order_by, folder_id=folder_id))


def categories_filter(
    page=1,
    time=JmMagicConstants.TIME_ALL,
    category=JmMagicConstants.CATEGORY_ALL,
    order_by=JmMagicConstants.ORDER_BY_LATEST,
):
    """分类/排行榜浏览（JmCategoryPage）。"""
    return run_on_loop(
        jm_async.categories_filter(page=page, time=time, category=category, order_by=order_by)
    )


def get_album_cover_url(album_id: str) -> str:
    """封面 URL（纯计算，无网络请求）。"""
    return JmcomicText.get_album_cover_url(album_id)


def normalize_avatar_url(photo: str | None) -> str | None:
    """头像 URL 归一化（纯计算，无网络请求）。

    JM 登录响应里的 photo 形如 ``3667109.jpg?v=1786776514``，
    只需补全为 ``https://{图片域名}/media/users/{photo}`` 供前端直接 <img> 加载；
    若已是完整 URL 则原样返回。
    """
    if not photo:
        return None
    photo = photo.strip()
    if photo.startswith(("http://", "https://", "//")):
        return photo
    photo = photo.lstrip("/")
    path = photo if "media/users/" in photo else f"media/users/{photo}"
    return f"https://{random.choice(JmModuleConfig.DOMAIN_IMAGE_LIST)}/{path}"


def normalize_badge_url(content: str | None) -> str | None:
    """奖牌图标 URL 归一化（纯计算，无网络请求）。

    评论里的 badge content 是站点静态资源相对路径（/static/resources/...），
    补全为 API 站点域名的完整 URL；已是完整 URL 则原样返回。
    """
    if not content:
        return None
    content = content.strip()
    if content.startswith(("http://", "https://", "//")):
        return content
    content = content.lstrip("/")
    return f"https://{JmModuleConfig.DOMAIN_API_LIST[0]}/{content}"


def get_num_by_url(scramble_id, img_url: str) -> int:
    """阅读页反混淆序号（纯计算，无网络请求）。"""
    return JmImageTool.get_num_by_url(scramble_id, img_url)
