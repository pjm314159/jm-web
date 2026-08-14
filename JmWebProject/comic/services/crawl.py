"""爬取编排服务（无 Celery，直接对接 Rust 下载微服务）。

流程：
1. jmcomic 获取元数据（批量复用单客户端连接）
2. 保存 Album/Photo 到 DB
3. 构建图片 URL 列表 → 提交 Rust 服务
4. 状态查询代理 Rust /api/v1/download/{task_id}/status

分层约束：views 只解析请求，本模块负责业务编排。
"""

import contextlib
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx
from django.conf import settings
from django.core.cache import cache

from ..models import Album, Photo
from ..utils import is_safe_filename, sanitize_filename
from . import jm_sync

logger = logging.getLogger(__name__)

# Redis key 前缀：crawl_id → 任务信息
_CRAWL_KEY = "jmw-crawl-{crawl_id}"
_CRAWL_INDEX_KEY = "jmw-crawl-index"
_CRAWL_TTL = settings.CRAWL_STATE_TTL  # 任务状态过期（默认 24h）

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
            timeout=settings.RUST_REQUEST_TIMEOUT,
            limits=httpx.Limits(
                max_connections=settings.RUST_HTTP_MAX_CONNECTIONS,
                max_keepalive_connections=settings.RUST_HTTP_MAX_KEEPALIVE,
            ),
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


def _cover_image_entry(cover_url: str, safe_album: str) -> dict:
    """封面图片条目：保存到专辑根目录（与 DB cover_path 一致）。"""
    return {
        "url": cover_url,
        "filename": "cover.png",
        "no_descramble": True,
        "save_path": os.path.join(
            settings.MEDIA_ROOT, "images", "jmcomic", safe_album, "cover.png"
        ),
    }


def _safe_images(photo_detail) -> list[dict]:
    """把远端章节图片列表过滤成安全的下载条目，拒绝路径穿越/分隔符/控制字符。"""
    images = []
    for img in photo_detail:
        if not is_safe_filename(getattr(img, "filename", "")):
            logger.warning("跳过不安全的图片文件名: %r", getattr(img, "filename", ""))
            continue
        filename = img.filename
        # GIF 是原始图片，无需反混淆（与 jmcomic decide_download_image_decode 一致）
        is_gif = getattr(img, "is_gif", False) or filename.lower().endswith(".gif")
        images.append(
            {
                "url": img.download_url,
                "filename": filename,
                "no_descramble": is_gif,
            }
        )
    return images


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
        Photo.objects.filter(jm_id__in=all_pids, is_downloaded=True).values_list("jm_id", flat=True)
    )
    pending_pids = [pid for pid in all_pids if pid not in downloaded_pids]

    # 并发获取章节详情（全局客户端 + Semaphore 限流）
    photo_details = jm_sync.fetch_photos_concurrent(pending_pids) if pending_pids else {}

    # ─── Phase 2: WRITE（所有读取成功后才写入） ───
    album_obj = _save_album(album_detail, jm_id)

    safe_album = sanitize_filename(album_obj.name)
    task_ids = []
    submitted = len(episodes) - len(pending_pids)  # 已下载的计入 submitted
    cover_url = jm_sync.get_album_cover_url(jm_id)
    cover_added = False

    # 先顺序准备全部提交条目（DB 写入与路径计算保持串行，避免 SQLite 锁竞争），
    # 再并发提交 Rust，缩短大本子提交阶段的串行网络往返
    submissions = []
    for p_id in pending_pids:
        photo_detail = photo_details.get(p_id)
        if photo_detail is None:
            logger.warning("章节详情获取失败，跳过: %s", p_id)
            continue

        images = _safe_images(photo_detail)
        if not images:
            continue

        if not cover_added:
            images.append(_cover_image_entry(cover_url, safe_album))
            cover_added = True

        p_index, p_name = ep_map[p_id]
        photo_obj = _get_or_create_photo(album_obj, p_id, p_index, p_name)
        safe_photo = sanitize_filename(photo_obj.name) or str(p_index)
        save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)
        scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
        aid = str(p_id)
        task_id = f"{crawl_id}-{p_id}"
        submissions.append((task_id, save_dir, scramble_id, aid, images))

    submit_concurrency = max(1, settings.JM_DOWNLOAD_PHOTO_CONCURRENCY)
    with ThreadPoolExecutor(max_workers=submit_concurrency) as pool:
        futures = [pool.submit(_submit_to_rust, *item) for item in submissions]
        for task_id, future in zip((item[0] for item in submissions), futures, strict=True):
            try:
                ok = future.result()
            except Exception as e:  # _submit_to_rust 已兜底，这里仅防御
                logger.error("提交任务异常 [%s]: %s", task_id, e)
                ok = False
            if ok:
                task_ids.append(task_id)
                submitted += 1

    # 存 Redis 供状态查询
    _save_crawl_info(crawl_id, jm_id, "album", task_ids, len(episodes))
    _clear_search_caches()

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

    images = _safe_images(photo_detail)
    if not images:
        return {
            "crawl_id": crawl_id,
            "chapters": 1,
            "submitted": 0,
            "message": "章节图片均不安全，已跳过",
        }
    cover_url = jm_sync.get_album_cover_url(target_album_id)

    # ─── Phase 2: WRITE ───
    album_obj = _save_album(album_detail, target_album_id)
    photo_obj = Photo.objects.filter(jm_id=jm_id).first()
    if photo_obj is None:
        photo_obj = Photo.objects.create(
            jm_id=jm_id,
            album=album_obj,
            name=photo_detail.name.strip(),
            sort_index=0,
        )
    else:
        # 重试已存在章节时保留原有排序，避免被重置到首位
        photo_obj.album = album_obj
        photo_obj.name = photo_detail.name.strip()
        photo_obj.save(update_fields=["album", "name"])

    safe_album = sanitize_filename(album_obj.name)
    safe_photo = sanitize_filename(photo_obj.name) or jm_id
    save_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album, safe_photo)

    if not album_obj.cover_path:
        images.append(_cover_image_entry(cover_url, safe_album))

    scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
    aid = str(jm_id)
    task_id = f"{crawl_id}-{jm_id}"

    ok = _submit_to_rust(task_id, save_dir, scramble_id, aid, images)
    task_ids = [task_id] if ok else []

    _save_crawl_info(crawl_id, jm_id, "photo", task_ids, 1)
    _clear_search_caches()

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


def _query_rust_tasks_batch() -> dict[str, dict] | None:
    """一次请求获取 Rust 全部任务状态（task_id -> {status, done, total}）。"""
    try:
        resp = _get_rust_client().get("/api/v1/download/tasks")
        if resp.status_code == 200:
            data = resp.json()
            return {t["task_id"]: t for t in data.get("tasks", [])}
    except Exception as e:
        logger.warning("查询 Rust 任务列表失败: %s", e)
    return None


def list_active_crawls() -> dict:
    """C2+：返回仍在下载中的任务列表（按 Redis 索引聚合 Rust 状态）。"""
    rust_tasks = _query_rust_tasks_batch()
    if rust_tasks is None:
        return {"tasks": [], "count": 0, "error": "下载服务不可达"}

    active = []
    for crawl_id in cache.get(_CRAWL_INDEX_KEY) or set():
        info = cache.get(_CRAWL_KEY.format(crawl_id=crawl_id))
        if info is None:
            continue

        task_ids = info.get("task_ids") or []
        total_chapters = info.get("total") or len(task_ids)
        done_chapters = 0
        failed_chapters = 0
        images_done = 0
        images_total = 0
        any_running = False

        for tid in task_ids:
            st = rust_tasks.get(tid)
            if st is None:
                continue
            status = st.get("status", "")
            if status in ("queued", "downloading"):
                any_running = True
            elif status == "completed":
                done_chapters += 1
            elif status == "failed":
                failed_chapters += 1
            images_done += st.get("done", 0)
            images_total += st.get("total", 0)

        # 没有任何章节仍在执行说明已结束（或已被 Rust 淘汰），不进入“正在下载”
        if not any_running:
            continue

        state = "PROGRESS" if done_chapters > 0 or images_done > 0 else "DOWNLOADING"
        active.append(
            {
                "crawl_id": crawl_id,
                "jm_id": info.get("jm_id"),
                "jm_type": info.get("jm_type"),
                "state": state,
                "progress": {
                    "chapters_done": done_chapters,
                    "chapters_total": total_chapters,
                    "images_done": images_done,
                    "images_total": images_total,
                },
            }
        )

    active.sort(key=lambda t: (0 if t["state"] == "PROGRESS" else 1, t["crawl_id"]))
    return {"tasks": active, "count": len(active)}


# ------------------------------------------------------------------
# 内部辅助
# ------------------------------------------------------------------
def _save_crawl_info(crawl_id: str, jm_id: str, jm_type: str, task_ids: list, total: int):
    cache.set(
        _CRAWL_KEY.format(crawl_id=crawl_id),
        {"jm_id": jm_id, "jm_type": jm_type, "task_ids": task_ids, "total": total},
        timeout=_CRAWL_TTL,
    )
    # 维护任务索引（与任务状态同 TTL），供“正在下载”列表遍历
    index = set(cache.get(_CRAWL_INDEX_KEY) or [])
    index.add(crawl_id)
    cache.set(_CRAWL_INDEX_KEY, index, timeout=_CRAWL_TTL)


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
            # 封面保存在专辑根目录（Rust 按 save_path 写入）
            if not photo.album.cover_path:
                photo.album.cover_path = os.path.join("images", "jmcomic", safe_album, "cover.png")
                photo.album.save(update_fields=["cover_path"])
            logger.info("已标记下载完成: %s (%s)", photo_jm_id, photo.save_path)
    except Photo.DoesNotExist:
        logger.warning("回调标记失败，Photo 不存在: jm_id=%s", photo_jm_id)
    except Exception:
        logger.exception("标记下载完成时出错: jm_id=%s", photo_jm_id)


def _clear_search_caches():
    """清空在线搜索结果缓存（含已下载标记），爬取不影响本地资源缓存。"""
    with contextlib.suppress(Exception):
        cache.delete_pattern("jmw-search-*")


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
        _clear_search_caches()
        logger.info("Rust 回调: 任务完成 %s", task_id)
    elif status_str == "failed":
        logger.warning("Rust 回调: 任务失败 %s, failed=%s", task_id, data.get("failed"))

    return {"ok": True}
