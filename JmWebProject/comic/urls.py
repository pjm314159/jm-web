"""comic 模块 API 路由（统一 /api/ 前缀，由主 urls.py 挂载）。

端点设计见 docs/plan.md 4.2。
"""

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register(r"library/albums", views.AlbumViewSet, basename="album")

urlpatterns = [
    # Library L5：本地阅读器
    path("library/photos/<int:pk>/", views.PhotoReaderView.as_view(), name="photo_reader"),
    # Crawl C1-C3：提交 + 任务状态 + Rust 回调
    path("crawl/", views.CrawlSubmitView.as_view(), name="crawl_submit"),
    path(
        "crawl/tasks/<str:task_id>/",
        views.CrawlTaskStatusView.as_view(),
        name="crawl_task_status",
    ),
    path("crawl/callback/", views.CrawlCallbackView.as_view(), name="crawl_callback"),
    # Local M1-M5
    path("local/media/", views.LocalMediaView.as_view(), name="local_media"),
    path("local/media/refresh/", views.LocalMediaRefreshView.as_view(), name="local_media_refresh"),
    path("local/images/<str:folder_name>/", views.LocalImagesView.as_view(), name="local_images"),
    path("local/videos/<str:folder_name>/", views.LocalVideosView.as_view(), name="local_videos"),
    path(
        "local/stream/<str:folder_name>/<str:file_name>/",
        views.VideoStreamView.as_view(),
        name="video_stream",
    ),
    # Search S1-S4
    path("search/", views.SearchView.as_view(), name="search"),
    path(
        "search/albums/<str:jm_id>/",
        views.SearchAlbumDetailView.as_view(),
        name="search_album_detail",
    ),
    path(
        "search/albums/<str:jm_id>/episodes/",
        views.SearchAlbumEpisodesView.as_view(),
        name="search_album_episodes",
    ),
    path(
        "search/albums/<str:jm_id>/comments/",
        views.SearchAlbumCommentsView.as_view(),
        name="search_album_comments",
    ),
    path(
        "search/photos/<str:photo_id>/images/",
        views.SearchPhotoImagesView.as_view(),
        name="search_photo_images",
    ),
]

urlpatterns += router.urls
