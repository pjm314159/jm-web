"""Celery 爬取任务（阶段 2：异步重写）。

执行模型（docs/plan.md 5.2/5.3）：
- worker 保持 --pool=threads，每个任务线程内 asyncio.run() 拥有独立事件循环，
  与 Django 同步 ORM 兼容。
- 一个任务 = 一个事件循环 = 一个异步客户端（jm_async.async_jm_client）。
- 所有数据库读写抽到同步函数，经 sync_to_async(thread_sensitive=True) 调用，
  规避 SQLite 在异步上下文中的连接问题。
- 章节级并发由 JM_DOWNLOAD_PHOTO_CONCURRENCY 控制，图片级并发由
  JM_DOWNLOAD_IMAGE_CONCURRENCY 控制（见 jm_async.download_photo_images）。
- 进度上报：self.update_state(state='PROGRESS', meta={current, total, photo_id})，
  供 C2 任务状态接口读取。
- 断点续传语义不变：已下载章节跳过。
"""

import asyncio
import logging
import os
import uuid

import httpx
from asgiref.sync import sync_to_async
from celery import shared_task
from django.conf import settings
from django.core.cache import cache

from .models import Album, Photo
from .services import jm_async
from .services.local_media import scan_local_media_folders
from .utils import sanitize_filename

logger = logging.getLogger(__name__)


# ----------------------------------------------------
# 同步 ORM 操作（在异步流程中经 sync_to_async 调用）
# ----------------------------------------------------
def _save_album_meta_sync(album_detail, album_id: str) -> Album:
    """保存/更新 Album 元数据并清除相关缓存。"""
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
    try:
        cache.delete_pattern("jmw-search-*")
        cache.delete_pattern("jmw-local-images-*")
        cache.delete_pattern("jmw-local-videos-*")
        cache.delete("jmw-local-media-folders")
    except Exception:
        logger.debug("清除缓存失败（可能非 Redis 后端）", exc_info=True)
    return album_obj


def _get_or_create_photo_sync(album_obj: Album, p_id, p_index, p_name) -> Photo:
    """获取或创建 Photo 记录（不覆盖已下载状态）。"""
    photo_obj, _ = Photo.objects.get_or_create(
        jm_id=p_id,
        defaults={
            "album": album_obj,
            "name": p_name.strip(),
            "sort_index": int(p_index) if str(p_index).isdigit() else 0,
        },
    )
    return photo_obj


def _update_or_create_photo_sync(album_obj: Album, jm_id: str, name: str) -> Photo:
    """单章下载场景：按 jm_id 更新或创建 Photo。"""
    photo_obj, _ = Photo.objects.update_or_create(
        jm_id=jm_id,
        defaults={"album": album_obj, "name": name.strip(), "sort_index": 0},
    )
    return photo_obj


def _mark_photo_downloaded_sync(photo_obj: Photo, save_dir_rel: str, page_arr) -> None:
    """标记章节已下载并落库，必要时用首图设封面。"""
    photo_obj.is_downloaded = True
    photo_obj.save_path = save_dir_rel
    photo_obj.save()
    if not photo_obj.album.cover_path and page_arr:
        photo_obj.album.cover_path = os.path.join(save_dir_rel, page_arr[0])
        photo_obj.album.save()


def _set_album_cover_sync(album_obj: Album, cover_rel: str) -> None:
    album_obj.cover_path = cover_rel
    album_obj.save()


def _cache_episode_ids_sync(jm_id: str, episode_ids: list) -> None:
    try:
        cache.set(f"jmw-album-episodes-{jm_id}", episode_ids, timeout=None)
    except Exception as e:
        logger.warning("更新 Redis episode 列表失败: %s", e)


# async 桥接（thread_sensitive=True 保证落在主线程，复用同步连接）
save_album_meta = sync_to_async(_save_album_meta_sync, thread_sensitive=True)
get_or_create_photo = sync_to_async(_get_or_create_photo_sync, thread_sensitive=True)
update_or_create_photo = sync_to_async(_update_or_create_photo_sync, thread_sensitive=True)
mark_photo_downloaded = sync_to_async(_mark_photo_downloaded_sync, thread_sensitive=True)
set_album_cover = sync_to_async(_set_album_cover_sync, thread_sensitive=True)
cache_episode_ids = sync_to_async(_cache_episode_ids_sync, thread_sensitive=True)
makedirs = sync_to_async(os.makedirs, thread_sensitive=True)


# ----------------------------------------------------
# 异步下载逻辑
# ----------------------------------------------------
async def _download_photo(client, photo_obj: Photo, album_name: str) -> bool:
    """下载单个章节：通过 Rust 微服务并发下载图片并落库。"""
    try:
        photo_detail = await jm_async.fetch_photo_detail(client, photo_obj.jm_id, False)

        safe_album_name = sanitize_filename(album_name)
        safe_photo_name = sanitize_filename(photo_obj.name) or photo_detail.name
        save_dir_abs = os.path.join(
            settings.MEDIA_ROOT, "images", "jmcomic", safe_album_name, safe_photo_name
        )
        save_dir_rel = os.path.join("images", "jmcomic", safe_album_name, safe_photo_name)
        await makedirs(save_dir_abs, exist_ok=True)

        page_arr = getattr(photo_detail, "page_arr", None)
        if page_arr is None:
            logger.error("JmPhotoDetail %s 缺少 page_arr", photo_obj.jm_id)
            return False

        # 构建 Rust 服务请求体
        images = [
            {"url": img.download_url, "filename": img.filename}
            for img in photo_detail
        ]
        scramble_id = str(getattr(photo_detail, "scramble_id", "220980"))
        aid = str(getattr(photo_detail, "album_id", photo_obj.jm_id))
        task_id = f"{photo_obj.jm_id}-{uuid.uuid4().hex[:8]}"

        payload = {
            "task_id": task_id,
            "save_dir": save_dir_abs,
            "scramble_id": scramble_id,
            "aid": aid,
            "concurrency": settings.JM_DOWNLOAD_IMAGE_CONCURRENCY,
            "images": images,
        }

        rust_url = settings.RUST_DOWNLOADER_URL
        async with httpx.AsyncClient(timeout=30) as http:
            # 提交下载任务
            resp = await http.post(f"{rust_url}/api/v1/download", json=payload)
            if resp.status_code not in (200, 202):
                logger.error("Rust 服务提交失败 [%s]: %s %s", task_id, resp.status_code, resp.text)
                return False

            # 轮询任务状态
            status_url = f"{rust_url}/api/v1/download/{task_id}/status"
            while True:
                await asyncio.sleep(2)
                sr = await http.get(status_url)
                if sr.status_code != 200:
                    logger.warning("轮询状态失败 [%s]: %s", task_id, sr.status_code)
                    continue
                data = sr.json()
                status = data.get("status", "")
                if status == "completed":
                    logger.info("Rust 下载完成 [%s]: %s/%s", task_id, data.get("done"), data.get("total"))
                    break
                if status == "failed":
                    logger.error("Rust 下载失败 [%s]: %s", task_id, data.get("failed"))
                    return False

        await mark_photo_downloaded(photo_obj, save_dir_rel, page_arr)
        return True
    except Exception:
        logger.exception("下载章节失败 %s", photo_obj.jm_id)
        return False


async def _download_cover(client, album_obj: Album, jm_id: str) -> None:
    """下载本子封面（失败仅告警，不中断任务）。"""
    safe_album_name = sanitize_filename(album_obj.name)
    album_dir_abs = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_album_name)
    await makedirs(album_dir_abs, exist_ok=True)
    cover_abs = os.path.join(album_dir_abs, "cover.png")
    cover_rel = os.path.join("images", "jmcomic", safe_album_name, "cover.png")
    try:
        await jm_async.download_album_cover(client, jm_id, cover_abs)
        await set_album_cover(album_obj, cover_rel)
        logger.info("封面已下载到: %s", cover_abs)
    except Exception as e:
        logger.warning("封面下载失败 %s: %s", jm_id, e)


async def _report_progress(task, current: int, total: int, photo_id) -> None:
    """进度上报（update_state 为同步方法，经 sync_to_async 调用）。

    进度为非关键路径：上报失败（如本地 apply 模式无 task_id）仅记日志，不中断下载。
    """
    try:
        await sync_to_async(task.update_state, thread_sensitive=True)(
            state="PROGRESS",
            meta={"current": current, "total": total, "photo_id": photo_id},
        )
    except Exception:
        logger.debug("进度上报失败（可能 task_id 为空）", exc_info=True)


async def _crawl_album(task, client, jm_id: str) -> str:
    """下载整个本子：元数据 + 封面 + 章节级并发下载 + Redis episode 列表。"""
    album_detail = await jm_async.fetch_album_detail(client, jm_id)
    album_obj = await save_album_meta(album_detail, jm_id)

    await _download_cover(client, album_obj, jm_id)

    episodes = list(getattr(album_detail, "episode_list", []))
    total = len(episodes)
    photo_semaphore = asyncio.Semaphore(settings.JM_DOWNLOAD_PHOTO_CONCURRENCY)
    completed = 0
    progress_lock = asyncio.Lock()

    async def _process_episode(photo_tuple) -> None:
        nonlocal completed
        p_id, p_index, p_name = photo_tuple[0], photo_tuple[1], photo_tuple[2]
        if p_name == "":
            p_name = p_index
        photo_obj = await get_or_create_photo(album_obj, p_id, p_index, p_name)
        if photo_obj.is_downloaded:
            logger.info("跳过已下载章节 %s", p_id)
        else:
            async with photo_semaphore:
                await _download_photo(client, photo_obj, album_obj.name)
        async with progress_lock:
            completed += 1
            await _report_progress(task, completed, total, p_id)

    await asyncio.gather(*(_process_episode(ep) for ep in episodes))

    await cache_episode_ids(jm_id, [ep[0] for ep in episodes])
    return f"Album {album_obj.name} done."


async def _crawl_photo(task, client, jm_id: str) -> str:
    """下载单个章节：定位所属本子 + 元数据 + 封面 + 下载。"""
    temp_photo_detail = await jm_async.fetch_photo_detail(client, jm_id, False)
    target_album_id = temp_photo_detail.album_id

    album_detail = await jm_async.fetch_album_detail(client, target_album_id)
    album_obj = await save_album_meta(album_detail, target_album_id)

    if not album_obj.cover_path:
        await _download_cover(client, album_obj, target_album_id)

    photo_obj = await update_or_create_photo(album_obj, jm_id, temp_photo_detail.name)
    await _report_progress(task, 0, 1, jm_id)
    await _download_photo(client, photo_obj, album_obj.name)
    await _report_progress(task, 1, 1, jm_id)
    return f"Photo {photo_obj.name} done."


async def _crawl_jm_async(task, jm_type: str, jm_id: str) -> str:
    async with jm_async.async_jm_client() as client:
        if jm_type == "album":
            return await _crawl_album(task, client, jm_id)
        return await _crawl_photo(task, client, jm_id)


# ----------------------------------------------------
# Celery 任务入口
# ----------------------------------------------------
@shared_task(bind=True)
def crawl_jm_task(self, jm_type: str, jm_id: str) -> str:
    """爬取任务入口：asyncio.run 驱动异步客户端。"""
    try:
        return asyncio.run(_crawl_jm_async(self, jm_type, jm_id))
    except jm_async.JmAsyncError as e:
        logger.exception("爬取失败 [%s/%s]", jm_type, jm_id)
        return f"失败: {e}"


@shared_task(name="comic.tasks.scan_local_media_task")
def scan_local_media_task():
    """定时扫描本地媒体目录并更新 Redis 缓存。"""
    try:
        scan_local_media_folders()
        return "Local media scan completed"
    except Exception as e:
        return f"Local media scan failed: {e}"
