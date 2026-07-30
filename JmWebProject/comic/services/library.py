"""本子库业务层：列表 / 详情 / 删除 / 检测更新 / 阅读器数据（L1-L5）。

视图层只负责解析请求与组装响应，业务编排集中于此。
网络调用统一走 services.jm_sync（阶段 2 替换为异步）。
"""

import contextlib
import logging
import os
import shutil

from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator

from ..models import Album, Photo
from ..utils import natural_sort_key, sanitize_filename
from . import jm_sync

logger = logging.getLogger(__name__)

IMAGES_PER_PAGE = 300
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def get_library_albums():
    """L1：至少含一个已下载章节的本子，按创建时间倒序（去重）。"""
    return Album.objects.filter(photos__is_downloaded=True).distinct().order_by("-updated_at")


def search_library_albums(q: str = "", tags: list[str] | None = None, authors: list[str] | None = None):
    """L1+：本地库高级搜索——名称/作者模糊 + 多 tag 交集筛选 + 多作者筛选。

    注意：SQLite 不支持 JSONField __contains，改用 Python 层过滤。
    """
    qs = get_library_albums()
    if q:
        from django.db.models import Q

        qs = qs.filter(Q(name__icontains=q) | Q(author__icontains=q))
    if authors:
        qs = qs.filter(author__in=authors)
    if tags:
        # SQLite 兼容：在 Python 层做 tag 交集筛选
        album_ids = [
            album.pk
            for album in qs.only("pk", "tags")
            if album.tags and all(tag in album.tags for tag in tags)
        ]
        qs = get_library_albums().filter(pk__in=album_ids)
    return qs


def get_all_library_tags(q: str = "", limit: int = 10) -> list[dict]:
    """返回本地库 tag（按频次降序）。

    - 无 q 时返回频次最高的前 limit 个 tag
    - 有 q 时返回所有包含 q 的 tag（不限数量）
    """
    from collections import Counter

    counter: Counter = Counter()
    for tag_list in Album.objects.filter(photos__is_downloaded=True).values_list("tags", flat=True).distinct():
        if tag_list:
            counter.update(tag_list)

    if q:
        kw = q.lower()
        items = [(tag, cnt) for tag, cnt in counter.items() if kw in tag.lower()]
        items.sort(key=lambda x: -x[1])
    else:
        items = counter.most_common(limit)

    return [{"tag": tag, "count": cnt} for tag, cnt in items]


def get_all_library_authors(q: str = "", limit: int = 10) -> list[dict]:
    """返回本地库作者（按作品数降序）。

    - 无 q 时返回作品数最多的前 limit 个作者
    - 有 q 时返回所有包含 q 的作者
    """
    from collections import Counter

    counter: Counter = Counter()
    for author in Album.objects.filter(photos__is_downloaded=True).exclude(author__isnull=True).exclude(author="").values_list("author", flat=True).distinct():
        if author:
            counter[author] += Album.objects.filter(photos__is_downloaded=True, author=author).distinct().count()

    if q:
        kw = q.lower()
        items = [(a, cnt) for a, cnt in counter.items() if kw in a.lower()]
        items.sort(key=lambda x: -x[1])
    else:
        items = counter.most_common(limit)

    return [{"author": a, "count": cnt} for a, cnt in items]


def delete_album(album: Album) -> None:
    """L3：删除本子——物理文件夹 + Redis episode 缓存 + 数据库记录（CASCADE 删章节）。"""
    safe_name = sanitize_filename(album.name)
    album_dir = os.path.join(settings.MEDIA_ROOT, "images", "jmcomic", safe_name)

    if os.path.exists(album_dir) and os.path.isdir(album_dir):
        try:
            shutil.rmtree(album_dir)
            logger.info("已物理删除文件夹: %s", album_dir)
        except Exception as e:
            logger.warning("删除文件夹失败: %s", e)
    else:
        logger.info("文件夹不存在，跳过物理删除: %s", album_dir)

    with contextlib.suppress(Exception):
        cache.delete(f"jmw-album-episodes-{album.jm_id}")

    album_name = album.name
    album.delete()
    logger.info("已删除数据库记录: %s", album_name)


def check_album_updates(album: Album) -> dict:
    """L4：对比远端 episode_list 与本地章节，返回新章节差集并更新缓存/total_episodes。"""
    local_photo_ids = set(album.photos.values_list("jm_id", flat=True))

    album_detail = jm_sync.fetch_album_detail(album.jm_id)
    remote_episodes = album_detail.episode_list if hasattr(album_detail, "episode_list") else []

    # 统一转为字符串比较，避免 int/str 不匹配
    remote_ids = {str(ep[0]) for ep in remote_episodes if ep[0]}
    new_episode_ids = remote_ids - local_photo_ids
    new_episodes = [ep for ep in remote_episodes if str(ep[0]) in new_episode_ids]

    with contextlib.suppress(Exception):
        cache.set(f"jmw-album-episodes-{album.jm_id}", list(remote_ids), timeout=None)

    album.total_episodes = len(remote_episodes)
    album.save(update_fields=["total_episodes"])

    return {
        "has_updates": len(new_episodes) > 0,
        "new_episodes": [
            {"photo_id": ep[0], "index": ep[1], "name": ep[2] if ep[2] else str(ep[1])}
            for ep in new_episodes
        ],
        "new_count": len(new_episodes),
        "local_count": len(local_photo_ids),
        "remote_count": len(remote_episodes),
    }


def get_photo_reader_data(photo: Photo, page=1, target=None) -> dict:
    """L5：本地阅读器数据——图片 URL 分页（300/页）+ target 跳转 + 上/下章导航。"""
    image_files: list[str] = []
    full_dir_path = os.path.join(settings.MEDIA_ROOT, photo.save_path) if photo.save_path else ""

    if full_dir_path and os.path.isdir(full_dir_path):
        files = [f for f in os.listdir(full_dir_path) if f.lower().endswith(IMAGE_EXTS)]
        files.sort(key=natural_sort_key)
        base_url = f"{settings.MEDIA_URL}{photo.save_path}".replace("\\", "/")
        image_files = [f"{base_url}/{f}" for f in files]

    total_images = len(image_files)

    # target 跳转：根据目标图片序号反推页码
    if target is not None:
        try:
            target_idx = int(target)
            page = (target_idx - 1) // IMAGES_PER_PAGE + 1
        except (ValueError, TypeError):
            pass

    paginator = Paginator(image_files, IMAGES_PER_PAGE)
    page_obj = paginator.get_page(page)
    current_start_index = page_obj.start_index() or 1

    siblings = Photo.objects.filter(album=photo.album).order_by("sort_index")
    prev_photo = siblings.filter(sort_index__lt=photo.sort_index).last()
    next_photo = siblings.filter(sort_index__gt=photo.sort_index).first()

    return {
        "photo_id": photo.id,
        "name": photo.name,
        "album_id": photo.album_id,
        "images": page_obj.object_list,
        "total_images": total_images,
        "current_start_index": current_start_index,
        "page": page_obj.number,
        "total_pages": paginator.num_pages,
        "images_per_page": IMAGES_PER_PAGE,
        "target": target,
        "prev_photo_id": prev_photo.id if prev_photo else None,
        "next_photo_id": next_photo.id if next_photo else None,
    }
