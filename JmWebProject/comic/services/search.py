"""在线搜索业务层：搜索 / 在线详情 / 章节列表 / 在线阅读器（S1-S4）。

网络调用统一走 services.jm_sync（阶段 2 替换为异步）。
搜索结果缓存 120s；已下载标记沿用旧逻辑（批量查询避免 N+1）。
"""

import contextlib
import datetime
import logging

from django.core.cache import cache
from django.core.paginator import Paginator

from ..models import Album
from . import jm_sync

logger = logging.getLogger(__name__)

IMAGES_PER_PAGE = 300
SEARCH_CACHE_TTL = 120


def _episode_to_dict(ep) -> dict:
    return {"photo_id": ep[0], "index": ep[1], "name": ep[2] if ep[2] else str(ep[1])}


def search(query: str, search_type: str = "keyword", page: int = 1) -> dict:
    """S1：关键字/标签搜索，缓存 120s，标记本地已下载。"""
    query = (query or "").strip()
    if not query:
        return {
            "query": "",
            "search_type": search_type,
            "results": [],
            "pagination": {},
            "error": None,
        }

    cache_key = f"jmw-search-{search_type}-{query}-{page}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    error_msg = None
    results: list[dict] = []
    pagination: dict = {}
    try:
        jm_page = (
            jm_sync.search_tag(query, page)
            if search_type == "tag"
            else jm_sync.search_site(query, page)
        )

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
        "error": error_msg,
    }
    if not error_msg:
        cache.set(cache_key, context, timeout=SEARCH_CACHE_TTL)
    return context


def get_album_detail(jm_id: str) -> dict:
    """S2：在线本子详情 + 更新检测（likes/views/comments + 章节列表）。"""
    album_detail = jm_sync.fetch_album_detail(jm_id)

    local_album = Album.objects.filter(jm_id=jm_id).first()
    is_downloaded = local_album.photos.filter(is_downloaded=True).exists() if local_album else False

    new_episode_count = 0
    has_updates = False
    if is_downloaded:
        remote_ids = {ep[0] for ep in album_detail.episode_list if ep[0]}
        local_cached_ids = set(cache.get(f"jmw-album-episodes-{jm_id}", []) or [])
        if local_cached_ids:
            new_episode_count = len(remote_ids - local_cached_ids)
        else:
            local_photo_count = local_album.photos.count() if local_album else 0
            new_episode_count = len(remote_ids) - local_photo_count
        has_updates = new_episode_count > 0

    author = "未知"
    if hasattr(album_detail, "authors") and album_detail.authors:
        author = album_detail.authors[0]
    elif hasattr(album_detail, "author"):
        author = album_detail.author

    return {
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
        "has_updates": has_updates,
        "new_episode_count": new_episode_count,
    }


def get_episode_list(jm_id: str) -> dict:
    """S3：在线章节列表。"""
    album_detail = jm_sync.fetch_album_detail(jm_id)
    return {
        "jm_id": jm_id,
        "name": album_detail.name,
        "episode_list": [_episode_to_dict(ep) for ep in album_detail.episode_list],
    }


def get_photo_images(photo_id: str, page: int = 1, target=None) -> dict:
    """S4：在线阅读器——返回 {url, num} 列表（300/页 + target 跳转），反混淆由前端做。"""
    photo_detail = jm_sync.fetch_photo_detail(photo_id, True)
    scramble_id = photo_detail.scramble_id

    image_data_list = [
        {"url": img.img_url, "num": jm_sync.get_num_by_url(scramble_id, img.img_url)}
        for img in photo_detail
    ]

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
