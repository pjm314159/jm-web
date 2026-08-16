"""在线搜索业务层：搜索 / 在线详情 / 章节列表 / 在线阅读器（S1-S4）。

网络调用统一走 services.jm_sync（阶段 2 替换为异步）。
搜索结果缓存 120s；已下载标记沿用旧逻辑（批量查询避免 N+1）。
"""

import contextlib
import datetime
import logging

from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator
from jmcomic import JmMagicConstants

from ..models import Album
from . import jm_sync

logger = logging.getLogger(__name__)

IMAGES_PER_PAGE = settings.IMAGES_PER_PAGE
SEARCH_CACHE_TTL = settings.SEARCH_CACHE_TTL
DETAIL_CACHE_TTL = settings.DETAIL_CACHE_TTL
COMMENT_CACHE_TTL = settings.COMMENT_CACHE_TTL
SEARCH_ORDER_BY_VALUES = {
    JmMagicConstants.ORDER_BY_LATEST,
    JmMagicConstants.ORDER_BY_VIEW,
    JmMagicConstants.ORDER_BY_PICTURE,
    JmMagicConstants.ORDER_BY_LIKE,
    JmMagicConstants.ORDER_BY_SCORE,
    JmMagicConstants.ORDER_BY_COMMENT,
    JmMagicConstants.ORDER_MONTH_RANKING,
    JmMagicConstants.ORDER_WEEK_RANKING,
    JmMagicConstants.ORDER_DAY_RANKING,
}
SEARCH_TIME_VALUES = {
    JmMagicConstants.TIME_TODAY,
    JmMagicConstants.TIME_WEEK,
    JmMagicConstants.TIME_MONTH,
    JmMagicConstants.TIME_ALL,
}
SEARCH_CATEGORY_VALUES = {
    JmMagicConstants.CATEGORY_ALL,
    JmMagicConstants.CATEGORY_DOUJIN,
    JmMagicConstants.CATEGORY_SINGLE,
    JmMagicConstants.CATEGORY_SHORT,
    JmMagicConstants.CATEGORY_ANOTHER,
    JmMagicConstants.CATEGORY_HANMAN,
    JmMagicConstants.CATEGORY_MEIMAN,
    JmMagicConstants.CATEGORY_DOUJIN_COSPLAY,
    JmMagicConstants.CATEGORY_3D,
    JmMagicConstants.CATEGORY_ENGLISH_SITE,
}
SEARCH_SUB_CATEGORY_VALUES = {
    JmMagicConstants.SUB_CHINESE,
    JmMagicConstants.SUB_JAPANESE,
    JmMagicConstants.SUB_ANOTHER_OTHER,
    JmMagicConstants.SUB_ANOTHER_3D,
    JmMagicConstants.SUB_ANOTHER_COSPLAY,
    JmMagicConstants.SUB_DOUJIN_CG,
    JmMagicConstants.SUB_SINGLE_YOUTH,
}


def _episode_to_dict(ep) -> dict:
    return {"photo_id": ep[0], "index": ep[1], "name": ep[2] if ep[2] else str(ep[1])}


def search(
    query: str,
    search_type: str = "keyword",
    page: int = 1,
    order_by: str | None = None,
    time: str | None = None,
    category: str | None = None,
    sub_category: str | None = None,
) -> dict:
    """S1：关键字/标签/作者/排行榜浏览，缓存 120s，标记本地已下载。"""
    query = (query or "").strip()
    order_by = order_by if order_by in SEARCH_ORDER_BY_VALUES else JmMagicConstants.ORDER_BY_LATEST
    time = time if time in SEARCH_TIME_VALUES else JmMagicConstants.TIME_ALL
    category = category if category in SEARCH_CATEGORY_VALUES else JmMagicConstants.CATEGORY_ALL
    sub_category = (sub_category or "").strip() or None
    sub_category = sub_category if sub_category in SEARCH_SUB_CATEGORY_VALUES else None

    cache_key = (
        f"jmw-search-{search_type}-{query}-{page}-{order_by}-{time}-{category}-{sub_category}"
    )
    cached = cache.get(cache_key)
    if cached:
        return cached

    error_msg = None
    results: list[dict] = []
    pagination: dict = {}
    try:
        search_kwargs = {
            "order_by": order_by,
            "time": time,
            "category": category,
            "sub_category": sub_category,
        }
        if search_type == "tag":
            jm_page = jm_sync.search_tag(query, page, **search_kwargs)
        elif search_type == "author":
            jm_page = jm_sync.search_author(query, page, **search_kwargs)
        elif search_type == "rank":
            # 排行榜：底层走 jmcomic categories_filter（月/周/日排行均派生于此）
            jm_page = jm_sync.categories_filter(
                page, time=time, category=category, order_by=order_by
            )
        else:
            jm_page = jm_sync.search_site(query, page, **search_kwargs)

        album_ids = [album_id for album_id, _ in jm_page.content]
        downloaded_ids = set(
            Album.objects.filter(jm_id__in=album_ids, photos__is_downloaded=True)
            .values_list("jm_id", flat=True)
            .distinct()
        )

        for album_id, info in jm_page.content:
            update_time = "未知"
            if info.get("update_at"):
                with contextlib.suppress(Exception):
                    update_time = datetime.datetime.fromtimestamp(int(info["update_at"])).strftime(
                        "%Y-%m-%d"
                    )
            results.append(
                {
                    "jm_id": album_id,
                    "name": info.get("name", "未知标题"),
                    "author": info.get("author", ""),
                    "tags": info.get("tags", []),
                    "description": info.get("description", ""),
                    "update_time": update_time,
                    "cover_url": jm_sync.get_album_cover_url(album_id),
                    "is_downloaded": album_id in downloaded_ids,
                    "category": info.get("category", {}).get("title", ""),
                }
            )

        pagination = {
            "current": page,
            "total": jm_page.total,
            "page_count": jm_page.page_count,
            "has_prev": page > 1,
            "has_next": page < jm_page.page_count,
            "prev_num": page - 1,
            "next_num": page + 1,
        }
    except Exception as e:
        error_msg = f"搜索出错: {e!s}"
        logger.exception("Search Error")

    context = {
        "query": query,
        "search_type": search_type,
        "results": results,
        "pagination": pagination,
        "filters": {
            "order_by": order_by,
            "time": time,
            "category": category,
            "sub_category": sub_category,
        },
        "error": error_msg,
    }
    if not error_msg:
        cache.set(cache_key, context, timeout=SEARCH_CACHE_TTL)
    return context


def get_album_detail(jm_id: str) -> dict:
    """S2：在线本子详情 + 更新检测（likes/views/comments + 章节列表），缓存 120s。"""
    cache_key = f"jmw-album-detail-{jm_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    album_detail = jm_sync.fetch_album_detail(jm_id)

    local_album = Album.objects.filter(jm_id=jm_id).first()
    is_downloaded = local_album.photos.filter(is_downloaded=True).exists() if local_album else False

    new_episode_count = 0
    has_updates = False
    if is_downloaded and local_album:
        remote_ids = {str(ep[0]) for ep in album_detail.episode_list if ep[0]}
        # 对比本地已下载章节（DB 记录），而非缓存的远端 ID
        local_downloaded_ids = set(
            local_album.photos.filter(is_downloaded=True).values_list("jm_id", flat=True)
        )
        new_episode_count = len(remote_ids - local_downloaded_ids)
        has_updates = new_episode_count > 0

    author = "未知"
    if hasattr(album_detail, "authors") and album_detail.authors:
        author = album_detail.authors[0]
    elif hasattr(album_detail, "author"):
        author = album_detail.author

    result = {
        "album": {
            "jm_id": jm_id,
            "name": album_detail.name,
            "author": author,
            "description": getattr(album_detail, "description", "暂无简介"),
            "tags": getattr(album_detail, "tags", []),
            "cover_url": jm_sync.get_album_cover_url(jm_id),
            "likes": album_detail.likes,
            "views": album_detail.views,
            "comments_count": album_detail.comment_count,
            "episode_list": [_episode_to_dict(ep) for ep in album_detail.episode_list],
        },
        "is_downloaded": is_downloaded,
        "local_album_id": local_album.id if local_album else None,
        "has_updates": has_updates,
        "new_episode_count": new_episode_count,
    }
    cache.set(cache_key, result, timeout=DETAIL_CACHE_TTL)
    return result


def get_episode_list(jm_id: str) -> dict:
    """S3：在线章节列表，缓存 120s。"""
    cache_key = f"jmw-episode-list-{jm_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    album_detail = jm_sync.fetch_album_detail(jm_id)
    result = {
        "jm_id": jm_id,
        "name": album_detail.name,
        "episode_list": [_episode_to_dict(ep) for ep in album_detail.episode_list],
    }
    cache.set(cache_key, result, timeout=DETAIL_CACHE_TTL)
    return result


def _comment_to_dict(comment) -> dict:
    """把 JmAlbumComment 转为前端友好的 dict（递归含嵌套回复）。"""
    return {
        "comment_id": comment.comment_id,
        "user_id": comment.user_id,
        "username": comment.username,
        "nickname": comment.nickname,
        "content": comment.content,
        "created_at": comment.created_at,
        "likes": comment.likes,
        "is_spoiler": comment.is_spoiler,
        "replies": [_comment_to_dict(r) for r in comment.replies],
    }


def get_comments(jm_id: str, page: int = 1) -> dict:
    """S5：在线评论分页（含嵌套回复），缓存 60s。"""
    cache_key = f"jmw-album-comments-{jm_id}-{page}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    comment_page = jm_sync.fetch_album_comments(jm_id, page)
    result = {
        "jm_id": jm_id,
        "page": page,
        "total": comment_page.total,
        "page_count": comment_page.page_count,
        "has_next": comment_page.page_count is not None and page < comment_page.page_count,
        "comments": [_comment_to_dict(c) for c in comment_page.content],
    }
    cache.set(cache_key, result, timeout=COMMENT_CACHE_TTL)
    return result


def get_photo_images(photo_id: str, page: int = 1, target=None) -> dict:
    """S4：在线阅读器——返回 {url, num} 列表（300/页 + target 跳转），反混淆由前端做。"""
    photo_detail = jm_sync.fetch_photo_detail(photo_id, True)
    scramble_id = photo_detail.scramble_id

    image_data_list = []
    for img in photo_detail:
        img_url = img.img_url
        is_gif = bool(getattr(img, "is_gif", False)) or img_url.split("?", 1)[0].lower().endswith(
            ".gif"
        )
        image_data_list.append(
            {
                "url": img_url,
                # GIF 是原始图片，无需反混淆（与下载端 no_descramble 对齐）
                "num": 0 if is_gif else jm_sync.get_num_by_url(scramble_id, img_url),
                "is_gif": is_gif,
            }
        )

    if target is not None:
        with contextlib.suppress(Exception):
            page = (int(target) - 1) // IMAGES_PER_PAGE + 1

    paginator = Paginator(image_data_list, IMAGES_PER_PAGE)
    page_obj = paginator.get_page(page)
    return {
        "photo_id": photo_id,
        "album_id": photo_detail.album_id,
        "scramble_id": scramble_id,
        "images": page_obj.object_list,
        "total_images": len(image_data_list),
        "current_start_index": page_obj.start_index() or 1,
        "page": page_obj.number,
        "total_pages": paginator.num_pages,
        "images_per_page": IMAGES_PER_PAGE,
        "target": target,
    }
