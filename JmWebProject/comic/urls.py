# comic/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # 1. 新首页 (Hub)
    path('', views.home_view, name='index'),

    # 2. 爬取功能页 (独立出来)
    path('crawl/', views.crawl_page_view, name='crawl_page'),
    path('crawl/api/', views.start_crawl_view, name='start_crawl_api'),  # AJAX 提交接口

    # 3. JmComic 模块 (原首页逻辑移到这里)
    path('library/', views.jm_album_list_view, name='jm_album_list'),
    path('library/<int:pk>/', views.jm_album_detail_view, name='album_detail'),
    path('library/<int:pk>/delete/', views.album_delete_view, name='album_delete'),

    # 4. 阅读页
    path('photo/<int:pk>/', views.jm_photo_detail_view, name='photo_detail'),

    # 5. 本地模块
    path('local/', views.local_media_view, name='local_media'),
    path('local/<str:type>/<str:folder_name>/', views.local_media_detail_view, name='local_media_detail'),
    # 6. search
    path('search/', views.search_view, name='search'),
    path('search/detail/<str:jm_id>/', views.search_detail_view, name='search_detail'),

    # 在线预览模块
    path('search/preview/album/<str:jm_id>/', views.search_preview_album_view, name='search_preview_album'),  # 章节目录
    path('search/preview/photo/<str:photo_id>/', views.search_preview_photo_view, name='search_preview_photo'),  # 阅读器

]