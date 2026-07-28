"""comic 模块序列化器。

ORM 模型（Album/Photo）用 ModelSerializer；
入参校验用 Serializer；
搜索/本地媒体/阅读器等来自 jmcomic 客户端或文件系统的数据，
由 services 层组装为 dict，不在此定义模型序列化器。

字段对齐 docs/plan.md 5.4 实体映射与 4.2 端点设计。
"""

from django.conf import settings
from rest_framework import serializers

from .models import Album, Photo


def build_media_url(relative_path: str | None) -> str | None:
    """把数据库存储的相对路径（如 images/jmcomic/x/cover.png）拼成可访问 URL。"""
    if not relative_path:
        return None
    return f"{settings.MEDIA_URL}{relative_path}".replace("\\", "/")


class PhotoSerializer(serializers.ModelSerializer):
    """章节（列表项）。"""

    class Meta:
        model = Photo
        fields = ["id", "jm_id", "name", "sort_index", "is_downloaded", "save_path"]


class AlbumSerializer(serializers.ModelSerializer):
    """本子卡片（列表用）。"""

    cover_url = serializers.SerializerMethodField()
    downloaded_episodes = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = [
            "id",
            "jm_id",
            "name",
            "author",
            "tags",
            "cover_url",
            "total_episodes",
            "downloaded_episodes",
            "created_at",
        ]

    def get_cover_url(self, obj) -> str | None:
        return build_media_url(obj.cover_path)

    def get_downloaded_episodes(self, obj) -> int:
        return obj.photos.filter(is_downloaded=True).count()


class AlbumDetailSerializer(AlbumSerializer):
    """本子详情：在卡片基础上补充描述、角色与章节列表。"""

    photos = PhotoSerializer(many=True, read_only=True)

    class Meta(AlbumSerializer.Meta):
        fields = [*AlbumSerializer.Meta.fields, "description", "actors", "photos"]


class CrawlSubmitSerializer(serializers.Serializer):
    """爬取提交入参：原始输入（纯数字 ID 或 album/photo 链接）。"""

    input = serializers.CharField(allow_blank=False)
