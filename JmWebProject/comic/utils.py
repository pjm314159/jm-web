# comic/utils.py
import re
import unicodedata


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


def sanitize_filename(name: str, default: str = "file", max_length: int = 255) -> str:
    """
    清理字符串，使其可以作为安全的文件名，同时避免 URL 解析错误和非法访问。

    处理内容：
    - 替换 Windows 非法字符: \\ / : * ? " < > |
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
    name = unicodedata.normalize("NFKC", name)

    # 2. 定义需要替换为下划线的字符集合
    #    - Windows 非法: \ / : * ? " < > |
    #    - URL/路径敏感: # & = + % ; @ $ ` ~ { } [ ] ( )  ! 等（可根据需要增删）
    #    注意：? 已在 Windows 非法中，此处列出完整集
    unsafe_chars = r'[#\\/:*?"<>|&=%+;@$`~{}\[\]()!]'
    # 补充控制字符范围：ASCII 0-31 除了空格(32) 以及 127
    control_chars = r"[\x00-\x1f\x7f]"

    # 先替换控制字符为空（直接删除）
    name = re.sub(control_chars, "", name)
    # 再替换不安全字符为下划线
    name = re.sub(unsafe_chars, "_", name)

    # 3. 处理路径遍历风险：将连续两个点号（..）替换为单个下划线，避免上级目录
    name = re.sub(r"\.{2,}", "_", name)
    # 将连续的多个下划线缩减为一个
    name = re.sub(r"_+", "_", name)

    # 4. 去除首尾的点和空格（Windows 不允许文件名以 . 或空格结尾）
    name = name.strip(" .")

    # 5. 空文件名回退
    if not name:
        return default

    # 6. 长度限制：保留扩展名（如果存在）
    if len(name) > max_length:
        # 分离文件名和扩展名（最后一个点）
        parts = name.rsplit(".", 1)
        if len(parts) == 2 and len(parts[1]) <= 10:  # 扩展名一般不长
            base, ext = parts
            base = base[: max_length - len(ext) - 1]
            name = f"{base}.{ext}"
        else:
            name = name[:max_length]

    return name
