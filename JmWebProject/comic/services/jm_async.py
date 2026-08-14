"""jmcomic 异步客户端封装（全局单例 + 后台事件循环）。

设计原则：
1. 全局维护唯一 jmcomic 异步客户端（后台守护线程事件循环），
   避免每次请求建连（TCP + TLS 握手 ~1-2s）。
2. 同步侧通过 run_on_loop() 提交协程到后台循环，阻塞等待结果。
3. 并发下载用 asyncio.Semaphore 限流。
4. 异常映射：MissingAlbumPhotoException / RequestRetryAllFailException /
   JsonResolveFailException / JmcomicException（兜底）统一包装为 JmAsyncError。

分层约束（docs/design.md 3）：视图层不直接 import jmcomic；查询类调用经
jm_sync.py 桥接，本模块是 jmcomic 异步 API 的唯一入口。
"""

import asyncio
import logging
import threading
import time
from collections.abc import Coroutine
from typing import Any

from asgiref.sync import sync_to_async
from django.conf import settings
from jmcomic import (
    JmcomicException,
    JmcomicText,
    JmMagicConstants,
    JsonResolveFailException,
    MissingAlbumPhotoException,
    RequestRetryAllFailException,
    create_option_by_str,
)

logger = logging.getLogger(__name__)


class JmAsyncError(Exception):
    """异步爬虫统一异常（已映射 jmcomic 底层异常，附带原始异常）。"""

    def __init__(self, message: str, original: Exception | None = None):
        super().__init__(message)
        self.original = original


def map_jm_exception(exc: JmcomicException) -> JmAsyncError:
    """把 jmcomic 底层异常映射为带可读信息的 JmAsyncError。"""
    if isinstance(exc, MissingAlbumPhotoException):
        return JmAsyncError(f"资源 ID 不存在: {exc}", exc)
    if isinstance(exc, RequestRetryAllFailException):
        return JmAsyncError(f"网络请求重试耗尽: {exc}", exc)
    if isinstance(exc, JsonResolveFailException):
        return JmAsyncError(f"响应解析失败: {exc}", exc)
    return JmAsyncError(f"jmcomic 错误: {exc}", exc)


def _build_option():
    """用 jmcomic 原生的 option 字符串机制构建，仅包含本项目需要的参数。"""
    lines = [
        "client:",
        f"  timeout: {settings.JM_OPTION_TIMEOUT}",
        f"  retry_times: {settings.JM_OPTION_RETRY_TIMES}",
    ]
    if settings.JM_OPTION_DOMAINS:
        lines.append("  domain:")
        lines.extend(f"    - {domain}" for domain in settings.JM_OPTION_DOMAINS)
    if settings.PROXY:
        lines.append("  postman:")
        lines.append("    meta_data:")
        lines.append(f'      proxies: "{settings.PROXY}"')
    return create_option_by_str("\n".join(lines))


# ------------------------------------------------------------------
# 全局客户端管理器（后台守护线程 + 持久事件循环 + 单例 client）
# ------------------------------------------------------------------
_loop: asyncio.AbstractEventLoop | None = None
_client: Any = None
_client_lock = asyncio.Lock()  # 保护 _client 初始化（事件循环内使用）


def _run_loop() -> None:
    """后台守护线程入口：创建事件循环并永久运行。"""
    global _loop
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    _loop.run_forever()


_thread = threading.Thread(target=_run_loop, daemon=True, name="jm-client-loop")
_thread.start()


async def _get_client():
    """获取全局 jmcomic 客户端（兜底懒初始化）。

    正常路径下客户端已在服务启动时由 init_client_async() 预创建，
    此函数仅覆盖两种罕见情形：启动预热尚未完成 / 启动初始化失败。
    """
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                _client = await _build_option().new_jm_async_client().__aenter__()
                logger.info("全局 jmcomic 异步客户端已创建")
    return _client


async def init_client_async() -> None:
    """服务启动时异步预创建全局客户端（不阻塞启动流程）。

    复用 _get_client 的双重检查锁：即便与首次请求竞争也不会重复创建。
    失败仅记录日志，首次请求会走懒初始化兜底重建。
    """
    try:
        await _get_client()
        logger.info("全局 jmcomic 异步客户端启动预热完成")
    except Exception as e:
        logger.warning("全局 jmcomic 客户端启动预热失败，将延迟到首次使用时重试: %s", e)


def init_client() -> None:
    """启动钩子入口：把预创建协程提交到后台事件循环，立即返回（不阻塞）。

    等待 _loop 就绪：后台线程仅创建循环，启动极快；
    AppConfig.ready() 可能先于线程完成赋值而执行，需避免竞态。
    """
    deadline = time.monotonic() + 5.0
    while _loop is None and time.monotonic() < deadline:
        time.sleep(0.01)
    if _loop is None:
        logger.warning("后台事件循环 5s 内未就绪，跳过客户端预热")
        return
    asyncio.run_coroutine_threadsafe(init_client_async(), _loop)


def run_on_loop(coro: Coroutine) -> Any:
    """在后台事件循环中执行协程，从同步线程阻塞等待结果。"""
    assert _loop is not None, "后台事件循环未启动"
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    return future.result()


# ------------------------------------------------------------------
# 查询类（内部协程，通过全局客户端发起请求）
# ------------------------------------------------------------------
async def fetch_album_detail(album_id: str):
    """获取本子详情（JmAlbumDetail）。"""
    client = await _get_client()
    try:
        return await client.get_album_detail(album_id)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def fetch_photo_detail(photo_id: str, fetch_scramble_id: bool = False):
    """获取章节详情（JmPhotoDetail，可迭代 JmImageDetail）。"""
    client = await _get_client()
    try:
        return await client.get_photo_detail(photo_id, fetch_scramble_id)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def search_site(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """关键字搜索（JmSearchPage）。"""
    client = await _get_client()
    try:
        return await client.search_site(
            search_query=query,
            page=page,
            order_by=order_by,
            time=time,
            category=category,
            sub_category=sub_category,
        )
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def search_tag(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """标签搜索（JmSearchPage）。"""
    client = await _get_client()
    try:
        return await client.search_tag(
            search_query=query,
            page=page,
            order_by=order_by,
            time=time,
            category=category,
            sub_category=sub_category,
        )
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def search_author(
    query: str,
    page: int = 1,
    order_by: str = JmMagicConstants.ORDER_BY_LATEST,
    time: str = JmMagicConstants.TIME_ALL,
    category: str = JmMagicConstants.CATEGORY_ALL,
    sub_category: str | None = None,
):
    """作者搜索（JmSearchPage，结构与关键字/标签一致）。"""
    client = await _get_client()
    try:
        return await client.search_author(
            search_query=query,
            page=page,
            order_by=order_by,
            time=time,
            category=category,
            sub_category=sub_category,
        )
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def fetch_album_comments(album_id: str, page: int = 1):
    """获取本子评论分页（JmAlbumCommentPage，含嵌套 replies）。"""
    client = await _get_client()
    try:
        return await client.album_pagination(album_id, page)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def fetch_photos_concurrent(photo_ids: list[str], max_concurrency: int = 6) -> dict:
    """并发获取多个章节详情（Semaphore 限流，复用全局客户端）。

    返回 {photo_id: photo_detail | None}，单个失败不中断其余。
    """
    client = await _get_client()
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _fetch_one(pid: str):
        async with semaphore:
            try:
                return pid, await client.get_photo_detail(pid, False)
            except Exception as e:
                logger.warning("获取章节详情失败 [%s]: %s", pid, e)
                return pid, None

    results = await asyncio.gather(*(_fetch_one(pid) for pid in photo_ids))
    return dict(results)


# ------------------------------------------------------------------
# 下载类（供 tasks.py 独立事件循环使用，传入显式 client）
# ------------------------------------------------------------------
async def download_album_cover(client, album_id: str, save_path: str) -> None:
    """下载本子封面（原图，不做反混淆解码）。"""
    cover_url = JmcomicText.get_album_cover_url(album_id)
    try:
        img_resp = await client.get_jm_image(cover_url)
    except JmcomicException as e:
        raise map_jm_exception(e) from e
    await sync_to_async(img_resp.transfer_to, thread_sensitive=True)(
        save_path, None, False, cover_url
    )


async def download_photo_images(
    client,
    photo_detail,
    save_dir: str,
    max_concurrency: int = 30,
) -> int:
    """并发下载章节全部图片（Semaphore 限流 + 反混淆解码保存）。

    单张失败记录日志并继续（不中断整章），返回成功下载的图片数。
    """
    semaphore = asyncio.Semaphore(max_concurrency)
    images = list(photo_detail)

    async def _download_one(image) -> bool:
        async with semaphore:
            filepath = f"{save_dir}/{image.filename}"
            try:
                img_resp = await client.get_jm_image(image.download_url)
                await sync_to_async(img_resp.transfer_to, thread_sensitive=True)(
                    filepath, int(image.scramble_id), True, image.download_url
                )
                return True
            except Exception as e:
                logger.warning("图片下载失败 [%s]: %s", image.filename, e)
                return False

    results = await asyncio.gather(*(_download_one(img) for img in images))
    failed = results.count(False)
    if failed:
        logger.warning("章节下载完成，%d 张图片失败", failed)
    return len(images) - failed
