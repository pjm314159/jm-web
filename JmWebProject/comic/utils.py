# comic/utils.py
import re


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
    # 注意：如果是纯数字，我们无法区分是 album 还是 photo
    # 这里的逻辑是：默认视为 album (本子)，或者您可以根据业务需求调整
    if input_str.isdigit():
        return 'album', input_str

    # 2. 尝试正则匹配 Photo 链接 (章节)
    # 匹配: http://xxxx/photo/{id} 或 http://xxxx/photo/{id}/?page=xxx
    photo_match = re.search(r'/photo/(\d+)', input_str)
    if photo_match:
        return 'photo', photo_match.group(1)

    # 3. 尝试正则匹配 Album 链接 (本子)
    # 匹配: http://xxx/album/{id}/xxxxx
    album_match = re.search(r'/album/(\d+)', input_str)
    if album_match:
        return 'album', album_match.group(1)

    return None, None