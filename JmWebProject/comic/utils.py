# comic/utils.py
import re
from pathlib import Path
from django.conf import settings
from django.core.cache import cache


def parse_jm_input(input_str):
    """
    解析用户输入，返回 (类型, ID)
    类型可以是: 'album' 或 'photo'
    如果解析失败，返回 (None, None)
    """
    if not input_str:
        return None, None

    input_str = input_str.strip()

    # 1. 检查是否是纯数字 ID
    if input_str.isdigit():
        return 'album', input_str

    # 2. 尝试正则匹配 Photo 链接 (章节)
    photo_match = re.search(r'/photo/(\d+)', input_str)
    if photo_match:
        return 'photo', photo_match.group(1)

    # 3. 尝试正则匹配 Album 链接 (本子)
    album_match = re.search(r'/album/(\d+)', input_str)
    if album_match:
        return 'album', album_match.group(1)

    return None, None


def natural_sort_key(name):
    """文件名自然排序 key（1.jpg, 2.jpg, 10.jpg）"""
    return [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', name)]


def scan_local_media_folders():
    """
    扫描本地媒体目录，返回 (image_albums, video_folders) 并写入 Redis 缓存。
    供启动初始化、定时任务、视图保底三处复用。
    """
    base_dir = Path(settings.MEDIA_ROOT)
    local_images_dir = base_dir / 'images' / 'local'
    image_albums = []

    if local_images_dir.exists():
        for folder in local_images_dir.iterdir():
            if folder.is_dir():
                image_files = sorted(
                    [f for f in folder.iterdir()
                     if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.gif']],
                    key=lambda x: natural_sort_key(x.name)
                )

                cover_url = None
                if image_files:
                    first_file = image_files[0]
                    cover_url = f"{settings.MEDIA_URL}images/local/{folder.name}/{first_file.name}"

                image_albums.append({
                    'name': folder.name,
                    'count': len(image_files),
                    'cover_url': cover_url,
                    'folder_name': folder.name,
                })

                # 同时缓存每个文件夹的图片列表
                files_list = [
                    {'name': f.name, 'url': f"{settings.MEDIA_URL}images/local/{folder.name}/{f.name}"}
                    for f in image_files
                ]
                cache.set(f'jmw-local-images-{folder.name}', files_list, timeout=None)

    # 扫描视频文件夹
    local_videos_dir = base_dir / 'videos'
    video_folders = []

    if local_videos_dir.exists():
        for folder in local_videos_dir.iterdir():
            if folder.is_dir():
                video_files = [
                    f for f in folder.iterdir()
                    if f.is_file() and f.suffix.lower() in ['.mp4', '.webm', '.mov', '.mkv']
                ]
                video_folders.append({
                    'name': folder.name,
                    'count': len(video_files),
                    'folder_name': folder.name,
                })

                # 同时缓存每个文件夹的视频列表
                files_list = [
                    {'name': f.name, 'url': f"/local/stream/{folder.name}/{f.name}/"}
                    for f in sorted(video_files, key=lambda x: natural_sort_key(x.name))
                ]
                cache.set(f'jmw-local-videos-{folder.name}', files_list, timeout=None)

    # 缓存文件夹列表
    context = {
        'image_albums': image_albums,
        'video_folders': video_folders,
    }
    cache.set('jmw-local-media-folders', context, timeout=None)

    return image_albums, video_folders