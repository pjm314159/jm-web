"""爬取编排服务（无 Celery，直接对接 Rust 下载微服务）。

流程：
1. jmcomic 获取元数据（1-3s 网络请求）
2. 保存 Album/Photo 到 DB
3. 构建图片 URL 列表 → 提交 Rust 服务
4. 状态查询代理 Rust /api/v1/download/{task_id}/status

分层约束：views 只解析请求，本模块负责业务编排。
"""

import logging
import os
import uuid

import httpx
from django.conf import settings
from django.core.cache import cache

from ..models import Album, Photo
from ..utils import sanitize_filename
from . import jm_sync

logger = logging.getLogger(__name__)

# Redis key 前缀：crawl_id → 任务信息
_CRAWL_KEY = "jmw-crawl-{crawl_id}"
_CRAWL_TTL = 3600 * 24  # 24h 过期


def _rust_url() -> str:
    return settings.RUST_DOWNLOADER_URL


# ------------------------------------------------------------------
# 元数据 + DB
# ------------------------------------------------------------------
def _save_album(album_detail, album_id: str) -> Album:
    author_str = "未知"
    if getattr(album_detail, "authors", None):
        author_str = ",".join(album_detail.authors)
    elif getattr(album_detail, "author", None):
        author_str = album_detail.author

    album_obj, _ = Album.objects.update_or_create(
        jm_id=album_id,
        defaults={
            "name": album_detail.name.strip(),
            "author": author_str,
            "tags": getattr(album_detail, "tags", []),
            "actors": getattr(album_detail, "actors", []),
            "description": getattr(album_detail, "description", ""),
            "total_episodes": len(getattr(album_detail, "episode_list", [])),
        },
    )
    return album_obj


def _get_or_create_photo(album_obj: Album, p_id, p_index, p_name) -> Photo:
    photo_obj, _ = Photo.objects.get_or_create(
        jm_id=p_id,
        defaults={
            "album": album_obj,
            "name": (p_name or p_index).strip(),
            "sort_index": int(p_index) if str(p_index).isdigit() else 0,
        },
    )
    return photo_obj


# ------------------------------------------------------------------
# Rust 服务交互
# ------------------------------------------------------------------
def _submit_to_rust(task_id: str, save_dir: str, scramble_id: str, aid: str, images: list) -> bool:
    """提交下载任务到 Rust 服务，返回是否成功。"""
    payload = {
        "task_id": task_id,
        "save_dir": save_dir,
        "scramble_id": scramble_id,
        "aid": aid,
        "concurrency": settings.JM_DOWNLOAD_IMAGE_CONCURRENCY,
        "images": images,
    }
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(f"{_rust_url()}/api/v1/download", json=payload)
            if resp.status_code in (200, 202):
                return True
            logger.error("Rust 提交失败 [%s]: %s %s", task_id, resp.status_code, resp.text)
    except Exception as e:
        logger.error("Rust 服务不可达: %s", e)
    return False


def _query_rust_status(task_id: str) -> dict | None:
    """查询 Rust 任务状态。"""
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(f"{_rust_url()}/api/v1/download/{task_id}/status")
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("查询 Rust 状态失败 [%s]: %s", task_id, e)
    return None


# ------------------------------------------------------------------
# 公开接口
# ------------------------------------------------------------------
def submit_crawl(jm_type: str, jm_id: str) -> dict:
    """提交爬取任务，返回 {crawl_id, chapters, message}。"""
    crawl_id = uuid.uuid4().hex[:12]

    if jm_type == "album":
        return _submit_album(crawl_id, jm_id)
    return _submit_photo(crawl_id, jm_id)


def _submit_album(crawl_id: str, jm_id: str) -> dict:
    """整本下载：获取元数据 → 逐章提交 Rust。"""
    album_detail = jm_sync.fetch_album_detail(jm_id)
    album_obj = _save_album(album_detail, jm_id)

    episodes = list(getattr(album_detail, "episode_list", []))
    if not episodes:
        return {"crawl_id": crawl_id, "chapters": 0, "message": "该本子无章节"}

    safe_album = sanitize_filename(album_obj.name)
    task_ids = []
    submitted = 0

    for ep in episodes:
        p_id, p_index, p_name = ep[0], ep[1], ep[2]
        if not p_name:
            p_name = p_index
        photo_obj = _get_or_create_photo(album_obj, p_id, p_index, p_name)

        if photo_obj.is_downloaded:
            submitted += 1
            continue

        # 获取章节图片列表
        try:
            photo_detail = jm_sync.fetch_photo_detail(p_id, False)
        except Exception as e:
            logger.warning("获取章节详情失败 %s: %s", p_id, e)
            continue

        images = [{"url": img.download_url, "filename": img.filename} for img in photo_detail]
        if not images:
            continue

        safe_photo = sanitize_filename(photo_obj.name) or str(p_index)
        save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)
        scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
        aid = str(getattr(photo_detail, "album_id", jm_id))
        task_id = f"{crawl_id}-{p_id}"

        if _submit_to_rust(task_id, save_dir, scramble_id, aid, images):
            task_ids.append(task_id)
            submitted += 1

    # 存 Redis 供状态查询
    _save_crawl_info(crawl_id, jm_id, "album", task_ids, len(episodes))

    # 清缓存
    _clear_caches()

    return {
        "crawl_id": crawl_id,
        "chapters": len(episodes),
        "submitted": submitted,
        "message": f"已提交 {submitted}/{len(episodes)} 章",
    }


def _submit_photo(crawl_id: str, jm_id: str) -> dict:
    """单章下载。"""
    photo_detail = jm_sync.fetch_photo_detail(jm_id, False)
    target_album_id = photo_detail.album_id

    album_detail = jm_sync.fetch_album_detail(target_album_id)
    album_obj = _save_album(album_detail, target_album_id)

    photo_obj = Photo.objects.update_or_create(
        jm_id=jm_id,
        defaults={"album": album_obj, "name": photo_detail.name.strip(), "sort_index": 0},
    )[0]

    images = [{"url": img.download_url, "filename": img.filename} for img in photo_detail]
    safe_album = sanitize_filename(album_obj.name)
    safe_photo = sanitize_filename(photo_obj.name) or jm_id
    save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)
    scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
    aid = str(getattr(photo_detail, "album_id", target_album_id))
    task_id = f"{crawl_id}-{jm_id}"

    ok = _submit_to_rust(task_id, save_dir, scramble_id, aid, images)
    task_ids = [task_id] if ok else []

    _save_crawl_info(crawl_id, jm_id, "photo", task_ids, 1)
    _clear_caches()

    return {
        "crawl_id": crawl_id,
        "chapters": 1,
        "submitted": 1 if ok else 0,
        "message": "已提交" if ok else "Rust 服务不可达",
    }


def get_crawl_status(crawl_id: str) -> dict:
    """聚合查询爬取进度。"""
    info = cache.get(_CRAWL_KEY.format(crawl_id=crawl_id))
    if not info:
        return {"crawl_id": crawl_id, "state": "UNKNOWN", "error": "任务不存在或已过期"}

    task_ids = info["task_ids"]
    total_chapters = info["total"]

    if not task_ids:
        return {"crawl_id": crawl_id, "state": "FAILED", "error": "无有效任务"}

    done_chapters = 0
    failed_chapters = 0
    total_images = 0
    done_images = 0

    for tid in task_ids:
        st = _query_rust_status(tid)
        if st is None:
            continue
        s = st.get("status", "")
        total_images += st.get("total", 0)
        done_images += st.get("done", 0)
        if s == "completed":
            done_chapters += 1
            # 标记 DB 已下载
            _mark_downloaded(tid, info)
        elif s == "failed":
            failed_chapters += 1

    # 判断整体状态
    if done_chapters + failed_chapters >= len(task_ids):
        state = "SUCCESS" if failed_chapters == 0 else "PARTIAL"
    elif done_chapters > 0 or done_images > 0:
        state = "PROGRESS"
    else:
        state = "DOWNLOADING"

    return {
        "crawl_id": crawl_id,
        "state": state,
        "progress": {
            "chapters_done": done_chapters,
            "chapters_total": total_chapters,
            "images_done": done_images,
            "images_total": total_images,
        },
    }


# ------------------------------------------------------------------
# 内部辅助
# ------------------------------------------------------------------
def _save_crawl_info(crawl_id: str, jm_id: str, jm_type: str, task_ids: list, total: int):
    cache.set(
        _CRAWL_KEY.format(crawl_id=crawl_id),
        {"jm_id": jm_id, "jm_type": jm_type, "task_ids": task_ids, "total": total},
        timeout=_CRAWL_TTL,
    )


def _mark_downloaded(task_id: str, info: dict):
    """任务完成后标记 Photo 已下载（幂等）。"""
    # task_id 格式: {crawl_id}-{photo_jm_id}
    parts = task_id.split("-", 1)
    if len(parts) < 2:
        return
    photo_jm_id = parts[1]
    try:
        photo = Photo.objects.get(jm_id=photo_jm_id)
        if not photo.is_downloaded:
            safe_album = sanitize_filename(photo.album.name)
            safe_photo = sanitize_filename(photo.name)
            photo.is_downloaded = True
            photo.save_path = os.path.join("images", "jmcomic", safe_album, safe_photo)
            photo.save()
            # 首章设封面
            if not photo.album.cover_path:
                photo.album.cover_path = os.path.join(photo.save_path, "cover.png")
                photo.album.save()
    except Photo.DoesNotExist:
        pass


def _clear_caches():
    try:
        cache.delete_pattern("jmw-search-*")
        cache.delete_pattern("jmw-local-images-*")
        cache.delete_pattern("jmw-local-videos-*")
        cache.delete("jmw-local-media-folders")
    except Exception:
        pass
