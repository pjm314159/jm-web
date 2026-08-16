"""个人资料业务层：JM 账号关联与收藏夹拉取。"""

import base64
import hashlib
import json
import math

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.cache import cache

from ..models import Album, LinkedJmAccount
from . import jm_sync
from .jm_async import JmAsyncError


class ProfileError(Exception):
    """个人资料业务错误（含用户可读信息）。"""


_FAVORITE_PAGE_SIZE = 20  # 与 jmcomic PAGE_SIZE_FAVORITE 一致
_FAVORITE_CACHE_TTL = 120
_FAVORITE_MAX_PAGES = 50


def _fernet() -> Fernet:
    """由 Django SECRET_KEY 派生 Fernet 密钥（本地账号密码强加密）。"""
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt_password(password: str) -> str:
    return _fernet().encrypt(password.encode("utf-8")).decode("ascii")


def _decrypt_password(raw: str) -> str:
    try:
        return _fernet().decrypt(raw.encode("ascii")).decode("utf-8")
    except Exception as e:
        raise ProfileError("关联账号数据异常，请重新关联") from e


def _account_dict(account: LinkedJmAccount) -> dict:
    info = account.account_info or {}
    return {
        "username": account.username,
        "uid": info.get("uid"),
        "avatar": jm_sync.normalize_avatar_url(info.get("photo")),
        "email": info.get("email"),
        "level_name": info.get("level_name"),
        "album_favorites": info.get("album_favorites"),
        "coin": info.get("coin"),
        "linked_at": account.updated_at.isoformat() if account.updated_at else None,
    }


def get_linked(user) -> dict | None:
    account = LinkedJmAccount.objects.filter(user=user).first()
    return _account_dict(account) if account else None


def link_account(user, username: str, password: str) -> dict:
    username = (username or "").strip()
    if not username or not password:
        raise ProfileError("用户名和密码不能为空")

    try:
        resp = jm_sync.login(username, password)
        raw = getattr(resp, "decoded_data", None)
        info = json.loads(raw) if raw else {}
    except JmAsyncError as e:
        raise ProfileError(f"登录失败: {e}") from e
    except Exception as e:
        raise ProfileError(f"登录失败: {e}") from e

    if not info.get("username") or not info.get("uid"):
        raise ProfileError("账号或密码错误")

    account, _ = LinkedJmAccount.objects.update_or_create(
        user=user,
        defaults={
            "username": username,
            "password": _encrypt_password(password),
            "account_info": info,
        },
    )
    return _account_dict(account)


def unlink_account(user) -> None:
    LinkedJmAccount.objects.filter(user=user).delete()


def _collect_favorites(account: LinkedJmAccount, password: str) -> dict:
    """登录并聚合拉取全部收藏页，标记本地是否已下载。"""
    try:
        # 同账号已登录则跳过重复登录（重复 login 容易失败），失败时再重登一次
        if jm_sync.current_username() != account.username:
            jm_sync.login(account.username, password)
        try:
            first = jm_sync.favorite_folder(page=1)
        except JmAsyncError:
            jm_sync.login(account.username, password)
            first = jm_sync.favorite_folder(page=1)
    except JmAsyncError as e:
        raise ProfileError(f"获取收藏夹失败: {e}") from e
    except Exception as e:
        raise ProfileError(f"获取收藏夹失败: {e}") from e

    items = [{"album_id": album_id, "title": title} for album_id, title in first.iter_id_title()]
    total = first.total if first.total is not None else len(items)
    page_count = min(first.page_count or 1, _FAVORITE_MAX_PAGES)

    for page in range(2, page_count + 1):
        try:
            page_data = jm_sync.favorite_folder(page=page)
            items.extend(
                {"album_id": album_id, "title": title}
                for album_id, title in page_data.iter_id_title()
            )
        except Exception:
            # 收藏夹接口容易出错：单页失败即停止，已拉取结果保留
            break

    album_ids = [item["album_id"] for item in items]
    downloaded_ids = set(
        Album.objects.filter(jm_id__in=album_ids, photos__is_downloaded=True)
        .values_list("jm_id", flat=True)
        .distinct()
    )
    albums = [
        {
            **item,
            "cover_url": jm_sync.get_album_cover_url(item["album_id"]),
            "is_downloaded": item["album_id"] in downloaded_ids,
        }
        for item in items
    ]
    return {"total": total or len(albums), "albums": albums}


def fetch_favorites(user, page: int = 1) -> dict:
    """聚合拉取收藏夹（缓存 120s）后本地分页，返回与搜索一致的结构。"""
    account = LinkedJmAccount.objects.filter(user=user).first()
    if account is None:
        raise ProfileError("尚未关联账号")

    try:
        page = max(1, int(page))
    except (TypeError, ValueError):
        page = 1

    password = _decrypt_password(account.password)
    cache_key = f"jmw-profile-favorites-{user.id}"
    data = cache.get(cache_key)
    if data is None:
        data = _collect_favorites(account, password)
        cache.set(cache_key, data, timeout=_FAVORITE_CACHE_TTL)

    total = data["total"]
    albums = data["albums"]
    page_count = max(1, math.ceil(total / _FAVORITE_PAGE_SIZE))
    start = (page - 1) * _FAVORITE_PAGE_SIZE
    return {
        "current": page,
        "total": total,
        "page_count": page_count,
        "has_prev": page > 1,
        "has_next": page < page_count,
        "prev_num": page - 1,
        "next_num": page + 1,
        "albums": albums[start : start + _FAVORITE_PAGE_SIZE],
    }
