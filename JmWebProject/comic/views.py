"""comic 模块 DRF 视图。

视图层只解析请求与组装响应，业务逻辑全部下沉到 services/（见 docs/design.md 3）。
端点设计见 docs/plan.md 4.2，统一前缀 /api/（由 comic/urls.py 挂载）。
"""

import logging
import os
import re
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Album, Photo
from .serializers import (
    AlbumDetailSerializer,
    AlbumSerializer,
    CrawlSubmitSerializer,
)
from .services import crawl as crawl_service
from .services import library, local_media, search
from .services import profile as profile_service
from .utils import parse_jm_input

logger = logging.getLogger(__name__)


# ====================================================
# 漫画库（/api/library/）L1-L5
# ====================================================
class AlbumViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """L1 列表 / L2 详情 / L3 删除 / L4 检测更新。"""

    def get_queryset(self):
        # L1 列表仅展示含已下载章节的本子；detail/destroy/check-updates 可操作任何存在的本子
        if self.action == "list":
            q = self.request.query_params.get("q", "").strip()
            tags_param = self.request.query_params.get("tags", "").strip()
            tags = [t.strip() for t in tags_param.split(",") if t.strip()] if tags_param else None
            authors_param = self.request.query_params.get("authors", "").strip()
            authors = (
                [a.strip() for a in authors_param.split(",") if a.strip()]
                if authors_param
                else None
            )
            if q or tags or authors:
                return library.search_library_albums(q=q, tags=tags, authors=authors)
            return library.get_library_albums()
        return Album.objects.all().order_by("-updated_at")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AlbumDetailSerializer
        return AlbumSerializer

    def perform_destroy(self, instance):
        # L3：文件 + 缓存 + 数据库三步删除
        library.delete_album(instance)

    @action(detail=True, methods=["post"], url_path="check-updates")
    def check_updates(self, request, pk=None):
        """L4：对比远端章节，返回新章节差集。"""
        album = self.get_object()
        try:
            data = library.check_album_updates(album)
        except Exception as e:
            logger.exception("检测更新失败")
            return Response({"error": f"检测失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data)

    @action(detail=False, methods=["get"])
    def tags(self, request):
        """L6：返回本地库 tag（默认 top10 频次，支持 q 搜索全部）。"""
        q = request.query_params.get("q", "").strip()
        limit = int(request.query_params.get("limit", 10))
        return Response({"tags": library.get_all_library_tags(q=q, limit=limit)})

    @action(detail=False, methods=["get"])
    def authors(self, request):
        """L7：返回本地库作者（默认 top10 作品数，支持 q 搜索全部）。"""
        q = request.query_params.get("q", "").strip()
        limit = int(request.query_params.get("limit", 10))
        return Response({"authors": library.get_all_library_authors(q=q, limit=limit)})


class PhotoReaderView(APIView):
    """L5：本地阅读器数据（图片 URL 分页 + target 跳转 + 上/下章导航）。"""

    def get(self, request, pk):
        try:
            photo = Photo.objects.select_related("album").get(pk=pk)
        except Photo.DoesNotExist:
            return Response({"error": "章节不存在"}, status=status.HTTP_404_NOT_FOUND)
        data = library.get_photo_reader_data(
            photo, page=request.GET.get("page", 1), target=request.GET.get("target")
        )
        return Response(data)


# ====================================================
# 爬取（/api/crawl/）C1-C2
# ====================================================
class CrawlSubmitView(APIView):
    """C1：提交爬取，直接对接 Rust 下载服务。"""

    def post(self, request):
        serializer = CrawlSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_input = serializer.validated_data["input"]
        jm_type, jm_id = parse_jm_input(raw_input)
        logger.info("爬取提交: input=%r -> type=%s, id=%s", raw_input, jm_type, jm_id)
        if not jm_id:
            return Response({"error": "无效链接或ID"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = crawl_service.submit_crawl(jm_type, jm_id)
        except Exception as e:
            logger.exception("爬取提交失败")
            return Response({"error": f"提交失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {"status": "success", "task_id": result["crawl_id"], **result},
            status=status.HTTP_202_ACCEPTED,
        )


class CrawlTaskStatusView(APIView):
    """C2：查询爬取进度（代理 Rust 服务状态）。"""

    def get(self, request, task_id):
        result = crawl_service.get_crawl_status(task_id)
        return Response(result)


class CrawlTasksListView(APIView):
    """C2+：列出所有仍在下载中的任务。"""

    def get(self, request):
        try:
            data = crawl_service.list_active_crawls()
        except Exception as e:
            logger.exception("获取下载任务列表失败")
            return Response(
                {"error": f"获取任务列表失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY
            )
        return Response(data)


class CrawlCallbackView(APIView):
    """C3：Rust 下载完成回调（内部接口，立即写入 DB）。"""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        result = crawl_service.handle_rust_callback(request.data)
        return Response(result)


# ====================================================
# 个人资料（/api/profile/）：JM 账号关联 + 收藏夹
# ====================================================
class ProfileView(APIView):
    """个人资料：查看已关联的 JM 账号信息。"""

    def get(self, request):
        account = profile_service.get_linked(request.user)
        return Response({"linked": account is not None, "account": account})


class ProfileLinkView(APIView):
    """关联 JM 账号（用户名 + 密码）。"""

    def post(self, request):
        try:
            account = profile_service.link_account(
                request.user,
                request.data.get("username", ""),
                request.data.get("password", ""),
            )
        except profile_service.ProfileError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("关联账号失败")
            return Response({"error": "关联失败，请稍后重试"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"account": account})


class ProfileUnlinkView(APIView):
    """解除 JM 账号关联。"""

    def post(self, request):
        profile_service.unlink_account(request.user)
        return Response({"ok": True})


class ProfileFavoritesView(APIView):
    """获取已关联账号的收藏夹。"""

    def get(self, request):
        try:
            data = profile_service.fetch_favorites(request.user, page=request.GET.get("page", 1))
        except profile_service.ProfileError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("获取收藏夹失败")
            return Response(
                {"error": "获取收藏夹失败，请稍后重试"}, status=status.HTTP_502_BAD_GATEWAY
            )
        return Response(data)


# ====================================================
# 本地媒体（/api/local/）M1-M5
# ====================================================
class LocalMediaView(APIView):
    """M1：图片/视频文件夹列表（读缓存）。"""

    def get(self, request):
        return Response(local_media.get_media_folders())


class LocalMediaRefreshView(APIView):
    """M2：清缓存并重扫。"""

    def post(self, request):
        return Response(local_media.refresh_media())


class LocalImagesView(APIView):
    """M3：本地图片分页（300/页、jump 跳转）。"""

    def get(self, request, folder_name):
        data = local_media.get_image_folder(
            folder_name, page=request.GET.get("page", 1), jump=request.GET.get("jump")
        )
        if data is None:
            return Response({"error": "文件夹不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)


class LocalVideosView(APIView):
    """M4：本地视频列表。"""

    def get(self, request, folder_name):
        data = local_media.get_video_folder(folder_name)
        if data is None:
            return Response({"error": "文件夹不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)


_VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".m4v": "video/x-m4v",
    ".mpg": "video/mpeg",
    ".mpeg": "video/mpeg",
}


class VideoStreamView(APIView):
    """M5：视频播放——生产环境走 Nginx X-Accel-Redirect 直出，开发环境回退 FileResponse。"""

    def get(self, request, folder_name, file_name):
        path = local_media.resolve_video_path(folder_name, file_name)
        if path is None:
            return Response({"error": "视频文件不存在"}, status=status.HTTP_404_NOT_FOUND)

        ext = os.path.splitext(file_name)[1].lower()
        content_type = _VIDEO_CONTENT_TYPES.get(ext, "application/octet-stream")

        # 生产环境（Nginx 反代）：X-Accel-Redirect 让 Nginx 直接 serve 文件
        if not settings.DEBUG:
            response = HttpResponse(content_type=content_type)
            # Nginx internal location 映射: /internal_videos/ -> /app/JmWebProject/media/videos/
            # URL 编码处理中文等非 ASCII 字符，Nginx 会自动解码 percent-encoded URI
            accel_path = quote(f"/internal_videos/{folder_name}/{file_name}")
            response["X-Accel-Redirect"] = accel_path
            response["Accept-Ranges"] = "bytes"
            return response

        # 开发环境回退：Django 直接读文件
        file_path = str(path)
        file_size = os.path.getsize(file_path)

        range_header = request.headers.get("range")
        if not range_header:
            response = FileResponse(
                open(file_path, "rb"),  # noqa: SIM115 FileResponse 负责关闭文件
                content_type=content_type,
                as_attachment=False,
            )
            response["Accept-Ranges"] = "bytes"
            response["Content-Length"] = str(file_size)
            return response

        byte_range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not byte_range_match:
            return HttpResponse(status=400)

        start_byte = int(byte_range_match.group(1))
        end_byte_match = byte_range_match.group(2)
        end_byte = int(end_byte_match) if end_byte_match else file_size - 1

        if start_byte >= file_size or end_byte >= file_size or start_byte > end_byte:
            return HttpResponse(status=416)

        content_length = end_byte - start_byte + 1

        def file_iterator(path_, start, length, chunk_size=8192):
            with open(path_, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        response = StreamingHttpResponse(
            file_iterator(file_path, start_byte, content_length),
            status=206,
            content_type=content_type,
        )
        response["Content-Range"] = f"bytes {start_byte}-{end_byte}/{file_size}"
        response["Accept-Ranges"] = "bytes"
        response["Content-Length"] = str(content_length)
        return response


# ====================================================
# 在线搜索（/api/search/）S1-S4
# ====================================================
class SearchView(APIView):
    """S1：搜索（keyword/tag，缓存 120s，标记本地已下载）。"""

    def get(self, request):
        try:
            page = int(request.GET.get("page", 1))
        except ValueError:
            page = 1
        data = search.search(
            query=request.GET.get("q", ""),
            search_type=request.GET.get("type", "keyword"),
            page=page,
            order_by=request.GET.get("order_by"),
            time=request.GET.get("time"),
            category=request.GET.get("category"),
            sub_category=request.GET.get("sub_category"),
        )
        return Response(data)


class SearchAlbumDetailView(APIView):
    """S2：在线本子详情 + 更新检测。"""

    def get(self, request, jm_id):
        try:
            data = search.get_album_detail(jm_id)
        except Exception as e:
            logger.exception("获取在线详情失败")
            return Response({"error": f"获取详情失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data)


class SearchAlbumEpisodesView(APIView):
    """S3：在线章节列表。"""

    def get(self, request, jm_id):
        try:
            data = search.get_episode_list(jm_id)
        except Exception as e:
            logger.exception("获取在线章节失败")
            return Response({"error": f"获取章节失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data)


class SearchAlbumCommentsView(APIView):
    """S5：在线评论分页（含嵌套回复，前端滚动加载）。"""

    def get(self, request, jm_id):
        try:
            page = int(request.GET.get("page", 1))
        except ValueError:
            page = 1
        try:
            data = search.get_comments(jm_id, page=page)
        except Exception as e:
            logger.exception("获取在线评论失败")
            return Response({"error": f"获取评论失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data)


class SearchPhotoImagesView(APIView):
    """S4：在线阅读器（返回 {url, num} 列表，前端做反混淆拼接渲染）。"""

    def get(self, request, photo_id):
        try:
            page = int(request.GET.get("page", 1))
        except ValueError:
            page = 1
        try:
            data = search.get_photo_images(photo_id, page=page, target=request.GET.get("target"))
        except Exception as e:
            logger.exception("在线阅读失败")
            return Response({"error": f"阅读失败: {e!s}"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(data)
