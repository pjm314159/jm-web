# comic/tasks.py
import os
import re

import unicodedata
from celery import shared_task
from django.conf import settings
from jmcomic import JmOption, multi_thread_launcher

from .models import Album, Photo

# 初始化客户端 (使用默认配置或从 settings 读取)
option =  JmOption.default()
client = option.new_jm_client()

# ----------------------------------------------------
# 工具函数：路径清洗
# ----------------------------------------------------
def sanitize_filename(name: str, default: str = "file", max_length: int = 255) -> str:
    """
    清理字符串，使其可以作为安全的文件名，同时避免 URL 解析错误和非法访问。

    处理内容：
    - 替换 Windows 非法字符: \ / : * ? " < > |
    - 替换 URL 保留字符: # & = + % ; @ $ (等，避免参数解析)
    - 替换路径遍历风险: 连续的点号或斜杠会被处理
    - 去除控制字符 (ASCII 0-31, 127)
    - 限制长度，保留扩展名（如果有）
    - 处理首尾的点号和空格（Windows 限制）
    - 如果清理后为空，返回 default
    """
    if not isinstance(name, str):
        name = str(name)

    # 1. Unicode 规范化（NFKC 可分解兼容字符，例如 ① -> 1）
    name = unicodedata.normalize('NFKC', name)

    # 2. 定义需要替换为下划线的字符集合
    #    - Windows 非法: \ / : * ? " < > |
    #    - URL/路径敏感: # & = + % ; @ $ ` ~ { } [ ] ( )  ! 等（可根据需要增删）
    #    注意：? 已在 Windows 非法中，此处列出完整集
    unsafe_chars = r'[#\\/:*?"<>|&=%+;@$`~{}\[\]()!]'
    # 补充控制字符范围：ASCII 0-31 除了空格(32) 以及 127
    control_chars = r'[\x00-\x1f\x7f]'

    # 先替换控制字符为空（直接删除）
    name = re.sub(control_chars, '', name)
    # 再替换不安全字符为下划线
    name = re.sub(unsafe_chars, '_', name)

    # 3. 处理路径遍历风险：将连续两个点号（..）替换为单个下划线，避免上级目录
    name = re.sub(r'\.{2,}', '_', name)
    # 将连续的多个下划线缩减为一个
    name = re.sub(r'_+', '_', name)

    # 4. 去除首尾的点和空格（Windows 不允许文件名以 . 或空格结尾）
    name = name.strip(' .')

    # 5. 空文件名回退
    if not name:
        return default

    # 6. 长度限制：保留扩展名（如果存在）
    if len(name) > max_length:
        # 分离文件名和扩展名（最后一个点）
        parts = name.rsplit('.', 1)
        if len(parts) == 2 and len(parts[1]) <= 10:  # 扩展名一般不长
            base, ext = parts
            base = base[:max_length - len(ext) - 1]
            name = f"{base}.{ext}"
        else:
            name = name[:max_length]

    return name


# ----------------------------------------------------
# 核心逻辑：保存/更新 Album 元数据
# ----------------------------------------------------
def save_or_update_album_meta(client, album_id):
    try:
        # 1. 获取详情对象
        album_detail = client.get_album_detail(album_id)

        # 2. 提取数据 (健壮性处理)
        # 作者：API有 .author(str) 和 .authors(list)，优先用 list 拼接
        author_str = "未知"
        if hasattr(album_detail, 'authors') and album_detail.authors:
            author_str = ",".join(album_detail.authors)
        elif hasattr(album_detail, 'author') and album_detail.author:
            author_str = album_detail.author

        # 3. 更新数据库
        album_obj, created = Album.objects.update_or_create(
            jm_id=album_id,
            defaults={
                'name': album_detail.name.strip(),
                'author': author_str,
                'tags': album_detail.tags if hasattr(album_detail, 'tags') else [],
                'actors': album_detail.actors if hasattr(album_detail, 'actors') else [],
                'description': getattr(album_detail, 'description', ''),
                'total_episodes': len(album_detail.episode_list) if hasattr(album_detail, 'episode_list') else 0
            }
        )
        return album_obj, album_detail

    except Exception as e:
        print(f"Error saving album meta {album_id}: {e}")
        return None, None


# ----------------------------------------------------
# 核心逻辑：下载单个章节 (Photo)
# ----------------------------------------------------
class Task:
    def __init__(self, photo_detail,save_dir_abs):
        self.photo_detail_iter = photo_detail.__iter__()
        self.save_dir_abs = save_dir_abs
        self.p = None
        self.filepath = ""
    def __iter__(self):
        return self
    def __next__(self):
        try:
            self.p = next(self.photo_detail_iter)
            filename = self.p.filename
            self.filepath = os.path.join(self.save_dir_abs, self.p.filename)
        except StopIteration:
            raise StopIteration
        return self
def download_single_image(image):
    client.download_by_image_detail(image.p, image.filepath)
def download_single_photo(client, photo_db_obj):
    """
    实际执行图片下载的函数
    """
    try:
        # 1. 获取 Photo 详情对象 (这是一个 Iterable 的对象，包含 JmImageDetail)
        photo_detail = client.get_photo_detail(photo_db_obj.jm_id, False)

        # 2. 规划保存路径: media/images/jmcomic/[本子名]/[章节名]/
        safe_album_name = sanitize_filename(photo_db_obj.album.name)
        safe_photo_name = sanitize_filename(photo_db_obj.name)
        if safe_photo_name == "":
            safe_photo_name = photo_detail.name
        # 绝对路径 (用于保存文件)
        save_dir_abs = os.path.join(settings.MEDIA_ROOT, 'images', 'jmcomic', safe_album_name, safe_photo_name)
        # 相对路径 (用于数据库存储和前端访问)
        save_dir_rel = os.path.join('images', 'jmcomic', safe_album_name, safe_photo_name)

        if not os.path.exists(save_dir_abs):
            os.makedirs(save_dir_abs)

        # 3. 遍历下载图片
        # photo_detail 是可迭代的，image 是 JmImageDetail 对象
        # 关键：我们同时使用 enumerate 索引和 photo_detail.page_arr 来获取文件名

        if not hasattr(photo_detail, 'page_arr'):
            print(f"Error: JmPhotoDetail for {photo_db_obj.jm_id} is missing .page_arr")
            return False

        page_arr = photo_detail.page_arr

        # download

        multi_thread_launcher(
            iter_objs=Task(photo_detail,save_dir_abs),
            apply_each_obj_func=download_single_image,
        )

        # 确保 image 迭代器和 page_arr 长度一致
        for index, image in enumerate(photo_detail):
            if index >= len(page_arr):
                print("Warning: image iterator exceeded page_arr length. Stopping download.")
                break

            # !!! 关键修正：从 page_arr 获取完整的图片文件名 !!!
            filename = page_arr[index]
            filepath = os.path.join(save_dir_abs, filename)

            # 使用用户提供的 API 下载
            if not os.path.exists(filepath):
                client.download_by_image_detail(image, filepath)
                print(f"已下载: {filepath}")

        # 4. 更新 Photo 状态
        photo_db_obj.is_downloaded = True
        photo_db_obj.save_path = save_dir_rel
        photo_db_obj.save()

        # 5. (可选) 尝试将第一张图设为本子封面
        if not photo_db_obj.album.cover_path and page_arr:
            # 使用 page_arr 中的第一个文件名
            first_img_path = os.path.join(save_dir_rel, page_arr[0])
            photo_db_obj.album.cover_path = first_img_path
            photo_db_obj.album.save()

        return True
    except Exception as e:
        print(f"Error downloading photo {photo_db_obj.jm_id}: {e}")
        return False

# ----------------------------------------------------
# Celery 任务入口
# ----------------------------------------------------
@shared_task
def crawl_jm_task(jm_type, jm_id):



    # === 场景 1: 下载整个本子 (Album) ===
    if jm_type == 'album':
        # 1. 保存元数据
        album_obj, album_detail = save_or_update_album_meta(client, jm_id)
        if not album_obj: return "Album metadata failed"
        # 2. 下载封面

        # 规划封面保存路径: media/images/jmcomic/[本子名]/cover.jpg
        safe_album_name = sanitize_filename(album_obj.name)
        album_dir_abs = os.path.join(settings.MEDIA_ROOT, 'images', 'jmcomic', safe_album_name)

        if not os.path.exists(album_dir_abs):
            os.makedirs(album_dir_abs)

        cover_filename = 'cover.png'  # 假设我们统一保存为 cover.png
        cover_filepath_abs = os.path.join(album_dir_abs, cover_filename)
        cover_filepath_rel = os.path.join('images', 'jmcomic', safe_album_name, cover_filename)

        try:
            # 调用 client.download_album_cover API
            client.download_album_cover(jm_id, cover_filepath_abs)

            # 更新数据库中的封面路径
            album_obj.cover_path = cover_filepath_rel
            album_obj.save()
            print(f"封面已下载到: {cover_filepath_abs}")
        except Exception as e:
            print(f"Warning: Failed to download cover for {jm_id}: {e}")
        # 2. 遍历章节列表并下载
        # episode_list 结构: [(photo_id, index, name), ...]
        if hasattr(album_detail, 'episode_list'):
            for photo_tuple in album_detail.episode_list:
                p_id, p_index, p_name = photo_tuple[0], photo_tuple[1], photo_tuple[2]
                if p_name == "":
                    p_name = p_index
                # 创建/获取 Photo 记录
                photo_obj, _ = Photo.objects.update_or_create(
                    jm_id=p_id,
                    defaults={
                        'album': album_obj,
                        'name': p_name.strip(),
                        'sort_index': int(p_index) if str(p_index).isdigit() else 0
                    }
                )

                # 执行下载
                download_single_photo(client, photo_obj)

        return f"Album {album_obj.name} done."

    # === 场景 2: 下载单个章节 (Photo) ===
    elif jm_type == 'photo':
        # 1. 获取 Photo 详情以找到 Album ID
        # 注意：get_photo_detail 返回的对象包含 .album_id
        temp_photo_detail = client.get_photo_detail(jm_id, False)
        target_album_id = temp_photo_detail.album_id

        # 2. 先保存所属 Album 的元数据 (保证外键存在)
        album_obj, _ = save_or_update_album_meta(client, target_album_id)
        if not album_obj: return "Parent Album failed"
        # 2.5. !!! 关键修正：单独下载 Photo 时，也尝试下载封面 !!!
        if not album_obj.cover_path:
            # 规划封面路径（与上面 Album 场景相同）
            safe_album_name = sanitize_filename(album_obj.name)
            album_dir_abs = os.path.join(settings.MEDIA_ROOT, 'images', 'jmcomic', safe_album_name)

            if not os.path.exists(album_dir_abs):
                os.makedirs(album_dir_abs)
            cover_filepath_abs = os.path.join(album_dir_abs, 'cover.png')
            cover_filepath_rel = os.path.join('images', 'jmcomic', safe_album_name, 'cover.png')

            try:
                client.download_album_cover(target_album_id, cover_filepath_abs)
                album_obj.cover_path = cover_filepath_rel
                album_obj.save()
            except Exception as e:
                print(f"Warning: Failed to download cover for {target_album_id} during photo download: {e}")
        # 3. 保存 Photo 记录
        photo_obj, _ = Photo.objects.update_or_create(
            jm_id=jm_id,
            defaults={
                'album': album_obj,
                'name': temp_photo_detail.name.strip(),
                # 单独下载时可能拿不到准确的 sort_index，暂设为0或尝试解析名字
                'sort_index': 0
            }
        )

        # 4. 执行下载
        download_single_photo(client, photo_obj)

        return f"Photo {photo_obj.name} done."