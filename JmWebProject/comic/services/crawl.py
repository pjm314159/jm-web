"""爬取编排服务（无 Celery，直接对接 Rust 下载微服务）。

流程：
1. jmcomic 获取元数据（批量复用单客户端连接）
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

# ------------------------------------------------------------------
# httpx 连接池（模块级单例，复用 TCP 连接）
# ------------------------------------------------------------------
_rust_client: httpx.Client | None = None


def _get_rust_client() -> httpx.Client:
    """懒初始化 httpx 客户端（连接池），避免每次调用新建连接。"""
    global _rust_client
    if _rust_client is None or _rust_client.is_closed:
        _rust_client = httpx.Client(
            base_url=settings.RUST_DOWNLOADER_URL,
            timeout=15,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _rust_client


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
# Rust 服务交互（复用 httpx 连接池）
# ------------------------------------------------------------------
def _submit_to_rust(task_id: str, save_dir: str, scramble_id: str, aid: str, images: list) -> bool:
    """提交下载任务到 Rust 服务，返回是否成功。"""
    callback_url = f"{settings.CRAWL_CALLBACK_URL}/api/crawl/callback/"
    payload = {
        "task_id": task_id,
        "save_dir": save_dir,
        "scramble_id": scramble_id,
        "aid": aid,
        "concurrency": settings.JM_DOWNLOAD_IMAGE_CONCURRENCY,
        "images": images,
        "callback_url": callback_url,
    }
    try:
        resp = _get_rust_client().post("/api/v1/download", json=payload)
        if resp.status_code in (200, 202):
            return True
        logger.error("Rust 提交失败 [%s]: %s %s", task_id, resp.status_code, resp.text)
    except Exception as e:
        logger.error("Rust 服务不可达: %s", e)
    return False


def _query_rust_status(task_id: str) -> dict | None:
    """查询 Rust 任务状态。"""
    try:
        resp = _get_rust_client().get(f"/api/v1/download/{task_id}/status")
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
    """整本下载（原子性：先完成所有网络读取，再统一写入 DB/Rust/Redis）。"""
    # ─── Phase 1: READ（纯网络读取，失败不落库） ───
    album_detail = jm_sync.fetch_album_detail(jm_id)
    episodes = list(getattr(album_detail, "episode_list", []))
    if not episodes:
        return {"crawl_id": crawl_id, "chapters": 0, "message": "该本子无章节"}

    # 确定待下载章节（查 DB 已下载状态，只读）
    ep_map = {}  # p_id -> (p_index, p_name)
    all_pids = []
    for ep in episodes:
        p_id, p_index, p_name = ep[0], ep[1], ep[2]
        if not p_name:
            p_name = p_index
        ep_map[p_id] = (p_index, p_name)
        all_pids.append(p_id)

    downloaded_pids = set(
        Photo.objects.filter(jm_id__in=all_pids, is_downloaded=True)
        .values_list("jm_id", flat=True)
    )
    pending_pids = [pid for pid in all_pids if pid not in downloaded_pids]

    # 并发获取章节详情（全局客户端 + Semaphore 限流）
    if pending_pids:
        photo_details = jm_sync.fetch_photos_concurrent(pending_pids)
    else:
        photo_details = {}

    # ─── Phase 2: WRITE（所有读取成功后才写入） ───
    album_obj = _save_album(album_detail, jm_id)

    safe_album = sanitize_filename(album_obj.name)
    task_ids = []
    submitted = len(episodes) - len(pending_pids)  # 已下载的计入 submitted
    cover_url = jm_sync.get_album_cover_url(jm_id)
    cover_added = False

    for p_id in pending_pids:
        photo_detail = photo_details.get(p_id)
        if photo_detail is None:
            logger.warning("章节详情获取失败，跳过: %s", p_id)
            continue

        images = [{"url": img.download_url, "filename": img.filename} for img in photo_detail]
        if not images:
            continue

        if not cover_added:
            images.append({"url": cover_url, "filename": "cover.png", "no_descramble": True})
            cover_added = True

        p_index, p_name = ep_map[p_id]
        photo_obj = _get_or_create_photo(album_obj, p_id, p_index, p_name)
        safe_photo = sanitize_filename(photo_obj.name) or str(p_index)
        save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)
        scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
        aid = str(p_id)
        task_id = f"{crawl_id}-{p_id}"

        if _submit_to_rust(task_id, save_dir, scramble_id, aid, images):
            task_ids.append(task_id)
            submitted += 1

    # 存 Redis 供状态查询
    _save_crawl_info(crawl_id, jm_id, "album", task_ids, len(episodes))
    _clear_caches()

    return {
        "crawl_id": crawl_id,
        "chapters": len(episodes),
        "submitted": submitted,
        "message": f"已提交 {submitted}/{len(episodes)} 章",
    }


def _submit_photo(crawl_id: str, jm_id: str) -> dict:
    """单章下载（原子性：先完成所有网络读取，再写入）。"""
    # ─── Phase 1: READ ───
    photo_detail = jm_sync.fetch_photo_detail(jm_id, False)
    target_album_id = photo_detail.album_id
    album_detail = jm_sync.fetch_album_detail(target_album_id)

    images = [{"url": img.download_url, "filename": img.filename} for img in photo_detail]
    cover_url = jm_sync.get_album_cover_url(target_album_id)

    # ─── Phase 2: WRITE ───
    album_obj = _save_album(album_detail, target_album_id)
    photo_obj = Photo.objects.update_or_create(
        jm_id=jm_id,
        defaults={"album": album_obj, "name": photo_detail.name.strip(), "sort_index": 0},
    )[0]

    if not album_obj.cover_path:
        images.append({"url": cover_url, "filename": "cover.png", "no_descramble": True})

    safe_album = sanitize_filename(album_obj.name)
    safe_photo = sanitize_filename(photo_obj.name) or jm_id
    save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)
    scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
    aid = str(jm_id)
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

    result = {
        "crawl_id": crawl_id,
        "state": state,
        "progress": {
            "chapters_done": done_chapters,
            "chapters_total": total_chapters,
            "images_done": done_images,
            "images_total": total_images,
        },
    }

    # 完成时附带本地 Album DB 主键，供前端跳转本地详情页
    if state in ("SUCCESS", "PARTIAL"):
        jm_id = info.get("jm_id")
        album = Album.objects.filter(jm_id=jm_id).only("id").first()
        if album:
            result["album_id"] = album.id

    return result


# ------------------------------------------------------------------
# 内部辅助
# ------------------------------------------------------------------
def _save_crawl_info(crawl_id: str, jm_id: str, jm_type: str, task_ids: list, total: int):
    cache.set(
        _CRAWL_KEY.format(crawl_id=crawl_id),
        {"jm_id": jm_id, "jm_type": jm_type, "task_ids": task_ids, "total": total},
        timeout=_CRAWL_TTL,
    )


def _mark_downloaded(task_id: str, info: dict | None = None):
    """任务完成后标记 Photo 已下载（幂等，容错）。"""
    # task_id 格式: {crawl_id}-{photo_jm_id}
    parts = task_id.split("-", 1)
    if len(parts) < 2:
        logger.warning("无法解析 task_id: %s", task_id)
        return
    photo_jm_id = parts[1]
    try:
        photo = Photo.objects.select_related("album").get(jm_id=photo_jm_id)
        if not photo.is_downloaded:
            safe_album = sanitize_filename(photo.album.name)
            safe_photo = sanitize_filename(photo.name)
            photo.is_downloaded = True
            photo.save_path = os.path.join("images", "jmcomic", safe_album, safe_photo)
            photo.save(update_fields=["is_downloaded", "save_path"])
            # 首章设封面（Rust 已随章节任务下载 cover.png）
            if not photo.album.cover_path:
                photo.album.cover_path = os.path.join(photo.save_path, "cover.png")
                photo.album.save(update_fields=["cover_path"])
            logger.info("已标记下载完成: %s (%s)", photo_jm_id, photo.save_path)
    except Photo.DoesNotExist:
        logger.warning("回调标记失败，Photo 不存在: jm_id=%s", photo_jm_id)
    except Exception:
        logger.exception("标记下载完成时出错: jm_id=%s", photo_jm_id)


def _clear_caches():
    try:
        cache.delete_pattern("jmw-search-*")
        cache.delete_pattern("jmw-local-images-*")
        cache.delete_pattern("jmw-local-videos-*")
        cache.delete("jmw-local-media-folders")
    except Exception:
        pass


# ------------------------------------------------------------------
# Rust 回调处理
# ------------------------------------------------------------------
def handle_rust_callback(data: dict) -> dict:
    """处理 Rust 下载服务的完成回调，立即写入 DB。"""
    task_id = data.get("task_id", "")
    status_str = data.get("status", "")

    if not task_id:
        return {"ok": False, "error": "missing task_id"}

    if status_str == "completed":
        _mark_downloaded(task_id)
        _clear_caches()
        logger.info("Rust 回调: 任务完成 %s", task_id)
    elif status_str == "failed":
        logger.warning("Rust 回调: 任务失败 %s, failed=%s", task_id, data.get("failed"))

    return {"ok": True}
