"""jmcomic 异步客户端封装（阶段 2）。

设计原则（docs/plan.md 5.1）：
1. 一个 Celery 任务 = 一个事件循环 = 一个异步客户端。任务入口用 asyncio.run() 启动，
   任务内全程复用同一 client，结束自动关闭连接。
2. 并发下载用 asyncio.Semaphore 限流，替代旧 multi_thread_launcher。
3. 异常映射：MissingAlbumPhotoException / RequestRetryAllFailException /
   JsonResolveFailException / JmcomicException（兜底）统一包装为 JmAsyncError；
   四类均继承 JmcomicException，非 jmcomic 异常正常向上传播。
4. 图片解码保存（JmImageResp.transfer_to）是同步文件 IO，用 sync_to_async 桥接，
   避免阻塞事件循环。

分层约束（docs/design.md 3）：视图层不直接 import jmcomic；查询类调用经
jm_sync.py 的 async_to_sync 桥接，本模块是 jmcomic 异步 API 的唯一入口。
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from asgiref.sync import sync_to_async
from jmcomic import (
    JmcomicException,
    JmcomicText,
    JmOption,
    JsonResolveFailException,
    MissingAlbumPhotoException,
    RequestRetryAllFailException,
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


@asynccontextmanager
async def async_jm_client():
    """异步客户端上下文：进入时新建，离开时自动关闭连接。"""
    async with JmOption.default().new_jm_async_client() as client:
        yield client


# ------------------------------------------------------------------
# 查询类（供 tasks 与 jm_sync 桥接复用）
# ------------------------------------------------------------------
async def fetch_album_detail(client, album_id: str):
    """获取本子详情（JmAlbumDetail）。"""
    try:
        return await client.get_album_detail(album_id)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def fetch_photo_detail(client, photo_id: str, fetch_scramble_id: bool = False):
    """获取章节详情（JmPhotoDetail，可迭代 JmImageDetail）。"""
    try:
        return await client.get_photo_detail(photo_id, fetch_scramble_id)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def search_site(client, query: str, page: int = 1):
    """关键字搜索（JmSearchPage）。"""
    try:
        return await client.search_site(search_query=query, page=page)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


async def search_tag(client, query: str, page: int = 1):
    """标签搜索（JmSearchPage）。"""
    try:
        return await client.search_tag(search_query=query, page=page)
    except JmcomicException as e:
        raise map_jm_exception(e) from e


# ------------------------------------------------------------------
# 下载类
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
