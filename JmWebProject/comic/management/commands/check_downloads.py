"""检测 DB 与文件系统不一致的章节记录（只读，不修改数据库）。

检测三种异常：
  A) 磁盘有文件但 DB 未标记下载（is_downloaded=False 或 save_path 为空）
  B) DB 标记已下载但磁盘文件缺失
  C) 磁盘有图片目录但 DB 完全没有对应记录（孤儿目录）

用法：
    python manage.py check_downloads
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand

from comic.models import Photo
from comic.utils import sanitize_filename

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _count_images(abs_path: str) -> int:
    if not os.path.isdir(abs_path):
        return 0
    return sum(1 for f in os.listdir(abs_path) if os.path.splitext(f)[1].lower() in IMAGE_EXTS)


class Command(BaseCommand):
    help = "检测 DB 与磁盘文件不一致的章节（只读诊断）"

    def handle(self, *args, **options):
        media_root = settings.MEDIA_ROOT
        photos = Photo.objects.select_related("album").all()

        # ─── A: 磁盘有文件，DB 未标记 ───
        type_a = []
        # ─── B: DB 标记已下载，磁盘缺失 ───
        type_b = []

        for photo in photos.iterator():
            safe_album = sanitize_filename(photo.album.name)
            safe_photo = sanitize_filename(photo.name)
            expected_rel = os.path.join("images", "jmcomic", safe_album, safe_photo)
            expected_abs = os.path.join(media_root, expected_rel)

            # 也检查 save_path 指向的路径（可能与预期路径不同）
            actual_abs = os.path.join(media_root, photo.save_path) if photo.save_path else None

            disk_count = _count_images(expected_abs)
            if actual_abs and actual_abs != expected_abs:
                disk_count = max(disk_count, _count_images(actual_abs))

            has_files = disk_count > 0

            if not photo.is_downloaded and has_files:
                type_a.append((photo, disk_count, expected_rel))
            elif photo.is_downloaded and not has_files:
                type_b.append((photo, photo.save_path or "(空)"))

        # ─── C: 磁盘有目录但 DB 完全无记录（孤儿） ───
        type_c = []
        jmcomic_root = os.path.join(media_root, "images", "jmcomic")
        if os.path.isdir(jmcomic_root):
            # 构建 DB 已知路径集合: {album_dir/photo_dir}
            known_paths = set()
            for photo in Photo.objects.select_related("album").all():
                safe_a = sanitize_filename(photo.album.name)
                safe_p = sanitize_filename(photo.name)
                known_paths.add(f"{safe_a}/{safe_p}")
                if photo.save_path:
                    # save_path 形如 images/jmcomic/xxx/yyy
                    parts = photo.save_path.replace("\\", "/").split("/")
                    if len(parts) >= 4 and parts[0] == "images" and parts[1] == "jmcomic":
                        known_paths.add(f"{parts[2]}/{parts[3]}")

            # 扫描磁盘两层目录
            for album_dir in sorted(os.listdir(jmcomic_root)):
                album_abs = os.path.join(jmcomic_root, album_dir)
                if not os.path.isdir(album_abs):
                    continue
                for photo_dir in sorted(os.listdir(album_abs)):
                    photo_abs = os.path.join(album_abs, photo_dir)
                    if not os.path.isdir(photo_abs):
                        continue
                    key = f"{album_dir}/{photo_dir}"
                    if key not in known_paths:
                        count = _count_images(photo_abs)
                        if count > 0:
                            type_c.append((album_dir, photo_dir, count))

        # ─── 输出报告 ───
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(f"═══ A类: 磁盘有文件但DB未标记 ({len(type_a)} 条) ═══")
        )
        for photo, count, rel in type_a:
            self.stdout.write(
                f"  [{photo.jm_id}] {photo.album.name} / {photo.name}  ({count} 张, 路径: {rel})"
            )

        self.stdout.write("")
        self.stdout.write(self.style.WARNING(f"═══ B类: DB已标记但磁盘缺失 ({len(type_b)} 条) ═══"))
        for photo, sp in type_b:
            self.stdout.write(
                f"  [{photo.jm_id}] {photo.album.name} / {photo.name}  (save_path: {sp})"
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(f"═══ C类: 磁盘有目录但DB无记录 ({len(type_c)} 条) ═══")
        )
        for album_dir, photo_dir, count in type_c:
            self.stdout.write(f"  {album_dir} / {photo_dir}  ({count} 张)")

        total_issues = len(type_a) + len(type_b) + len(type_c)
        self.stdout.write("")
        if total_issues:
            self.stdout.write(self.style.ERROR(f"共发现 {total_issues} 条不一致"))
            self.stdout.write("  A类: 磁盘有文件但DB未标记 → 从前端重新下载（会补全元数据）")
            self.stdout.write("  B类: DB已标记但磁盘缺失 → 从前端重新下载")
            self.stdout.write("  C类: 孤儿目录(无DB记录) → 需搜索关键词获取元数据后重新入库")
        else:
            self.stdout.write(self.style.SUCCESS("✓ 全部一致，无异常"))
