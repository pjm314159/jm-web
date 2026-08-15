"""本地媒体业务层：目录扫描 + 文件夹列表 / 图片分页 / 视频列表 / 路径解析（M1-M5）。

scan_local_media_folders 由 utils.py 迁入（design.md U4）。
缓存键沿用 jmw-local-* 语义，服务重启自动重建。
"""

import json
import logging
from pathlib import Path

from django.conf import settings
from django.core.cache import cache, caches
from django.core.paginator import Paginator
from django_redis import get_redis_connection
from django_redis.cache import RedisCache

from ..utils import build_media_url, natural_sort_key

logger = logging.getLogger(__name__)

IMAGES_PER_PAGE = settings.IMAGES_PER_PAGE
IMAGE_EXTS = settings.LOCAL_IMAGE_EXTS
VIDEO_EXTS = settings.LOCAL_VIDEO_EXTS


def _is_redis_backend() -> bool:
    return isinstance(caches["default"], RedisCache)


def _media_key(name: str) -> str:
    """Redis 后端返回带 KEY_PREFIX:version 的完整 key（与 Rust scanner 一致）。"""
    return cache.make_key(name)


def _cache_get(name: str):
    """读取本地媒体缓存：Redis 后端按原始 JSON 读取（与 Rust scanner 兼容），
    其他后端（如测试 locmem）退回 Django cache API，内部同样存 JSON 字符串。"""
    try:
        if _is_redis_backend():
            raw = get_redis_connection("default").get(_media_key(name))
            return json.loads(raw) if raw else None
        value = cache.get(name)
        if isinstance(value, bytes):
            value = value.decode("utf-8")
        return json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def _cache_set(name: str, value) -> None:
    if _is_redis_backend():
        get_redis_connection("default").set(_media_key(name), json.dumps(value, ensure_ascii=False))
        return
    cache.set(name, json.dumps(value, ensure_ascii=False), timeout=None)


def scan_local_media_folders():
    """扫描本地媒体目录，返回 (image_albums, video_folders) 并写入 Redis 缓存。

    供启动初始化、定时任务、视图保底三处复用。
    """
    base_dir = Path(settings.MEDIA_ROOT)
    local_images_dir = base_dir / "images" / "local"
    image_albums = []

    if local_images_dir.exists():
        for folder in local_images_dir.iterdir():
            if folder.is_dir():
                image_files = sorted(
                    [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS],
                    key=lambda x: natural_sort_key(x.name),
                )

                cover_url = None
                # 堆叠预览：取前 3 张图片 URL（design.md L39，不足三张前端条件渲染）
                preview_urls = [
                    url
                    for f in image_files[:3]
                    if (url := build_media_url("images/local", folder.name, f.name)) is not None
                ]
                if preview_urls:
                    cover_url = preview_urls[0]

                image_albums.append(
                    {
                        "name": folder.name,
                        "count": len(image_files),
                        "cover_url": cover_url,
                        "preview_urls": preview_urls,
                        "folder_name": folder.name,
                    }
                )

                files_list = [
                    {
                        "name": f.name,
                        "url": build_media_url("images/local", folder.name, f.name),
                    }
                    for f in image_files
                ]
                _cache_set(f"jmw-local-images-{folder.name}", files_list)

    local_videos_dir = base_dir / "videos"
    video_folders = []

    if local_videos_dir.exists():
        for folder in local_videos_dir.iterdir():
            if folder.is_dir():
                video_files = [
                    f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTS
                ]

                # 封面（design.md L40）：优先名为 cover 的图片，否则首张图片，无则 None
                cover_url = None
                cover_images = sorted(
                    [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS],
                    key=lambda x: natural_sort_key(x.name),
                )
                if cover_images:
                    cover_file = next(
                        (f for f in cover_images if f.stem.lower() == "cover"), cover_images[0]
                    )
                    cover_url = build_media_url("videos", folder.name, cover_file.name)

                video_folders.append(
                    {
                        "name": folder.name,
                        "count": len(video_files),
                        "cover_url": cover_url,
                        "folder_name": folder.name,
                    }
                )

                files_list = [
                    {
                        "name": f.name,
                        "url": build_media_url("videos", folder.name, f.name),
                    }
                    for f in sorted(video_files, key=lambda x: natural_sort_key(x.name))
                ]
                _cache_set(f"jmw-local-videos-{folder.name}", files_list)

    context = {
        "image_albums": image_albums,
        "video_folders": video_folders,
    }
    _cache_set("jmw-local-media-folders", context)

    return image_albums, video_folders


def get_media_folders() -> dict:
    """M1：图片/视频文件夹列表（读缓存，miss 时扫描）。"""
    context = _cache_get("jmw-local-media-folders")
    if context is None:
        image_albums, video_folders = scan_local_media_folders()
        context = {"image_albums": image_albums, "video_folders": video_folders}
    return context


def refresh_media() -> dict:
    """M2：清缓存并重新扫描。"""
    try:
        cache.delete_pattern("jmw-local-images-*")
        cache.delete_pattern("jmw-local-videos-*")
        cache.delete("jmw-local-media-folders")
    except Exception:
        logger.warning("清除本地媒体缓存失败", exc_info=True)
    image_albums, video_folders = scan_local_media_folders()
    return {"image_albums": image_albums, "video_folders": video_folders}


def get_image_folder(folder_name: str, page=1, jump=None) -> dict | None:
    """M3：本地图片分页（300/页、jump 跳转）。文件夹不存在返回 None。"""
    base_dir = Path(settings.MEDIA_ROOT)
    target_dir = base_dir / "images" / "local" / folder_name
    if not target_dir.exists():
        return None

    cache_key = f"jmw-local-images-{folder_name}"
    files = _cache_get(cache_key)
    if files is None:
        scan_local_media_folders()
        files = _cache_get(cache_key) or []

    paginator = Paginator(files, IMAGES_PER_PAGE)
    target_jump_index = None
    if jump:
        try:
            jump_index = max(1, int(jump))
            jump_index = min(jump_index, len(files))
            page = ((jump_index - 1) // IMAGES_PER_PAGE) + 1
            target_jump_index = jump_index
        except ValueError:
            pass

    page_obj = paginator.get_page(page)
    return {
        "folder_name": folder_name,
        "files": page_obj.object_list,
        "count": paginator.count,
        "start_index": page_obj.start_index() or 1,
        "total_pages": paginator.num_pages,
        "current_page": page_obj.number,
        "target_jump_index": target_jump_index,
    }


def get_video_folder(folder_name: str) -> dict | None:
    """M4：本地视频列表。文件夹不存在返回 None。"""
    base_dir = Path(settings.MEDIA_ROOT)
    target_dir = base_dir / "videos" / folder_name
    if not target_dir.exists():
        return None

    cache_key = f"jmw-local-videos-{folder_name}"
    files = _cache_get(cache_key)
    if files is None:
        scan_local_media_folders()
        files = _cache_get(cache_key) or []

    return {
        "folder_name": folder_name,
        "files": files,
        "count": len(files),
        "first_video": files[0] if files else None,
    }


def resolve_video_path(folder_name: str, file_name: str) -> Path | None:
    """M5：解析视频文件绝对路径，做路径遍历防护；非法或不存在返回 None。"""
    base = (Path(settings.MEDIA_ROOT) / "videos").resolve()
    path = (base / folder_name / file_name).resolve()
    if base not in path.parents or not path.is_file():
        return None
    return path
