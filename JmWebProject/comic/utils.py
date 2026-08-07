# comic/utils.py
import re
import unicodedata
from urllib.parse import quote

from django.conf import settings

_WINDOWS_ILLEGAL = r'[\\/:*?"<>|]'
_CONTROL_CHARS = r"[\x00-\x1f\x7f]"


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
        return "album", input_str

    # 2. 尝试正则匹配 Photo 链接 (章节)
    photo_match = re.search(r"/photo/(\d+)", input_str)
    if photo_match:
        return "photo", photo_match.group(1)

    # 3. 尝试正则匹配 Album 链接 (本子)
    album_match = re.search(r"/album/(\d+)", input_str)
    if album_match:
        return "album", album_match.group(1)

    return None, None


def natural_sort_key(name):
    """文件名自然排序 key（1.jpg, 2.jpg, 10.jpg）"""
    return [int(c) if c.isdigit() else c for c in re.split(r"(\d+)", name)]


def _utf8_len(s: str) -> int:
    """返回字符串的 UTF-8 字节长度。"""
    return len(s.encode("utf-8"))


def _truncate_utf8(s: str, max_bytes: int) -> str:
    """按 UTF-8 字节数截断，保证不会切断多字节字符。"""
    if _utf8_len(s) <= max_bytes:
        return s
    result = ""
    for ch in s:
        if _utf8_len(result + ch) > max_bytes:
            break
        result += ch
    return result


def build_media_url(relative_path: str | None, *extra: str) -> str | None:
    """把数据库存储的相对路径/文件名拼成可访问的媒体 URL。

    每个路径段都做 RFC 3986 百分号编码，保证含空格、中文、[]()%# 等
    字符的文件名不会破坏 URL 解析，也不会与查询参数/片段冲突。
    """
    if not relative_path:
        return None
    parts = [p for p in str(relative_path).replace("\\", "/").split("/") if p]
    parts.extend(str(p) for p in extra if p)
    if not parts:
        return None
    encoded = "/".join(quote(p, safe="") for p in parts)
    return f"{settings.MEDIA_URL}{encoded}"


def is_safe_filename(name: str) -> bool:
    """严格校验单个文件名（远端图片等），拒绝路径穿越、分隔符和控制字符。

    通过校验不等于“清洗”：这里只允许绝对安全的单段文件名，
    任何可能导致路径逃逸或平台兼容问题的名字都直接拒绝。
    """
    if not isinstance(name, str) or not name:
        return False
    if name in (".", "..") or ".." in name:
        return False
    if name.startswith(".") or name != name.strip():
        return False
    if re.search(_CONTROL_CHARS, name):
        return False
    if re.search(_WINDOWS_ILLEGAL, name):
        return False
    return _utf8_len(name) <= 255


def sanitize_filename(name: str, default: str = "file", max_length: int = 255) -> str:
    """
    清理字符串，使其可以作为安全的文件系统名称（仅处理文件系统层面的约束）。

    处理内容：
    - 替换 Windows 非法字符: \\ / : * ? " < > |
    - 替换路径遍历风险: 连续的点号或斜杠会被处理
    - 去除控制字符 (ASCII 0-31, 127)
    - 限制长度（按 UTF-8 字节数），保留扩展名（如果有）
    - 处理首尾的点号和空格（Windows 限制）
    - 如果清理后为空，返回 default

    注意：URL 安全由 build_media_url 在拼接 URL 时做百分号编码负责，
    这里不再因为 URL 保留字符而改写合法文件名（如 [ ] ( ) % # 等）。
    """
    if not isinstance(name, str):
        name = str(name)

    # 1. Unicode 规范化（NFKC 可分解兼容字符，例如 ① -> 1）
    name = unicodedata.normalize("NFKC", name)

    # 2. 控制字符直接删除
    name = re.sub(_CONTROL_CHARS, "", name)

    # 3. 仅替换 Windows 非法字符为下划线
    name = re.sub(_WINDOWS_ILLEGAL, "_", name)

    # 4. 处理路径遍历风险：将连续两个点号（..）替换为单个下划线，避免上级目录
    name = re.sub(r"\.{2,}", "_", name)

    # 5. 去除首尾的点和空格（Windows 不允许文件名以 . 或空格结尾）
    name = name.strip(" .")

    # 6. 空文件名回退
    if not name:
        return default

    # 7. 长度限制：按 UTF-8 字节数截断，保留扩展名（如果存在）
    #    文件系统对单个文件名组件的长度上限是 255 字节（NAME_MAX），
    #    中文等字符在 UTF-8 下占 3 字节，仅按字符数截断仍会触发
    #    "Filename too long (os error 36)"。
    if _utf8_len(name) > max_length:
        # 分离文件名和扩展名（最后一个点）
        parts = name.rsplit(".", 1)
        if len(parts) == 2 and len(parts[1]) <= 10:  # 扩展名一般不长
            base, ext = parts
            budget = max_length - _utf8_len(ext) - 1  # 留出 '.' 的 1 字节
            if budget >= 1:
                base = _truncate_utf8(base, budget)
                name = f"{base}.{ext}"
            else:
                name = _truncate_utf8(name, max_length)
        else:
            name = _truncate_utf8(name, max_length)

    return name
