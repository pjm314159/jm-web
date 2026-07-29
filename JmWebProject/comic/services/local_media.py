"""本地媒体业务层：目录扫描 + 文件夹列表 / 图片分页 / 视频列表 / 路径解析（M1-M5）。

scan_local_media_folders 由 utils.py 迁入（design.md U4）。
缓存键沿用 jmw-local-* 语义，服务重启自动重建。
B7: 增量扫描——记录目录 mtime，未变化时跳过重扫。
"""

import logging
import os
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator

from ..utils import natural_sort_key

logger = logging.getLogger(__name__)

IMAGE_PER_PAGE = 300
IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
VIDEO_EXTS = [".mp4", ".webm", ".mov", ".mkv"]

# B7: 目录 mtime 快照（进程内，避免每次 stat 所有子目录）
_dir_mtimes: dict[str, float] = {}


def _dir_changed(path: Path) -> bool:
    """B7: 比对目录 mtime，未变化返回 False。"""
    key = str(path)
    try:
        mtime = os.stat(path).st_mtime
    except OSError:
        return True
    if _dir_mtimes.get(key) == mtime:
        return False
    _dir_mtimes[key] = mtime
    return True


def scan_local_media_folders(force: bool = False):
    """扫描本地媒体目录，返回 (image_albums, video_folders) 并写入 Redis 缓存。

    B7: 增量扫描——仅重扫 mtime 变化的目录，大目录扫描从秒级降到毫秒级。
    供启动初始化、定时任务、视图保底三处复用。
    """
    base_dir = Path(settings.MEDIA_ROOT)
    local_images_dir = base_dir / "images" / "local"
    image_albums = []

    if local_images_dir.exists():
        for folder in local_images_dir.iterdir():
            if not folder.is_dir():
                continue
            # B7: 目录未变化且缓存已存在 → 从缓存读取摘要
            cache_key = f"jmw-local-images-{folder.name}"
            if not force and not _dir_changed(folder) and cache.get(cache_key) is not None:
                files_list = cache.get(cache_key)
                image_albums.append(
                    {
                        "name": folder.name,
                        "count": len(files_list),
                        "cover_url": files_list[0]["url"] if files_list else None,
                        "preview_urls": [f["url"] for f in files_list[:3]],
                        "folder_name": folder.name,
                    }
                )
                continue

            image_files = sorted(
                [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS],
                key=lambda x: natural_sort_key(x.name),
            )

            cover_url = None
            preview_urls = [
                f"{settings.MEDIA_URL}images/local/{folder.name}/{f.name}" for f in image_files[:3]
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
                    "url": f"{settings.MEDIA_URL}images/local/{folder.name}/{f.name}",
                }
                for f in image_files
            ]
            cache.set(cache_key, files_list, timeout=None)

    local_videos_dir = base_dir / "videos"
    video_folders = []

    if local_videos_dir.exists():
        for folder in local_videos_dir.iterdir():
            if not folder.is_dir():
                continue
            cache_key = f"jmw-local-videos-{folder.name}"
            if not force and not _dir_changed(folder) and cache.get(cache_key) is not None:
                files_list = cache.get(cache_key)
                video_folders.append(
                    {
                        "name": folder.name,
                        "count": len(files_list),
                        "cover_url": None,
                        "folder_name": folder.name,
                    }
                )
                continue

            video_files = [
                f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in VIDEO_EXTS
            ]

            cover_url = None
            cover_images = sorted(
                [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS],
                key=lambda x: natural_sort_key(x.name),
            )
            if cover_images:
                cover_file = next(
                    (f for f in cover_images if f.stem.lower() == "cover"), cover_images[0]
                )
                cover_url = f"{settings.MEDIA_URL}videos/{folder.name}/{cover_file.name}"

            video_folders.append(
                {
                    "name": folder.name,
                    "count": len(video_files),
                    "cover_url": cover_url,
                    "folder_name": folder.name,
                }
            )

            files_list = [
                {"name": f.name, "url": f"{settings.MEDIA_URL}videos/{folder.name}/{f.name}"}
                for f in sorted(video_files, key=lambda x: natural_sort_key(x.name))
            ]
            cache.set(cache_key, files_list, timeout=None)

    context = {
        "image_albums": image_albums,
        "video_folders": video_folders,
    }
    cache.set("jmw-local-media-folders", context, timeout=None)

    return image_albums, video_folders


def get_media_folders() -> dict:
    """M1：图片/视频文件夹列表（读缓存，miss 时扫描）。"""
    context = cache.get("jmw-local-media-folders")
    if context is None:
        image_albums, video_folders = scan_local_media_folders()
        context = {"image_albums": image_albums, "video_folders": video_folders}
    return context


def refresh_media() -> dict:
    """M2：清缓存并重新扫描（B7: force=True 强制全量）。"""
    try:
        cache.delete_pattern("jmw-local-images-*")
        cache.delete_pattern("jmw-local-videos-*")
        cache.delete("jmw-local-media-folders")
    except Exception:
        logger.warning("清除本地媒体缓存失败", exc_info=True)
    _dir_mtimes.clear()  # B7: 重置 mtime 快照
    image_albums, video_folders = scan_local_media_folders(force=True)
    return {"image_albums": image_albums, "video_folders": video_folders}


def get_image_folder(folder_name: str, page=1, jump=None) -> dict | None:
    """M3：本地图片分页（300/页、jump 跳转）。文件夹不存在返回 None。"""
    base_dir = Path(settings.MEDIA_ROOT)
    target_dir = base_dir / "images" / "local" / folder_name
    if not target_dir.exists():
        return None

    cache_key = f"jmw-local-images-{folder_name}"
    files = cache.get(cache_key)
    if files is None:
        scan_local_media_folders()
        files = cache.get(cache_key, [])

    paginator = Paginator(files, IMAGE_PER_PAGE)
    target_jump_index = None
    if jump:
        try:
            jump_index = max(1, int(jump))
            jump_index = min(jump_index, len(files))
            page = ((jump_index - 1) // IMAGE_PER_PAGE) + 1
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
    files = cache.get(cache_key)
    if files is None:
        scan_local_media_folders()
        files = cache.get(cache_key, [])

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
