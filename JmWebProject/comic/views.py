# comic/views.py
# from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.conf import settings
from django.http import HttpResponseForbidden
# from django.db.models import Q
# from django.db import models  # 用于搜索Q查询
from pathlib import Path
import os
import shutil  # 用于递归删除文件夹
import re
import datetime
from .models import Album, Photo
from .tasks import sanitize_filename  # 复用 tasks 中的清洗函数，确保路径一致
from jmcomic import JmcomicClient,JmSearchPage, JmcomicText,JmOption # 修正 jmcomic 导入
from .models import Album
from .tasks import crawl_jm_task
from .utils import parse_jm_input

# 初始化客户端
client = JmOption.default().new_jm_client()
# ----------------------------------------------------
# 1. 本子总览页 (Card UI)
# ----------------------------------------------------
@login_required
def jm_album_list_view(request):
    """
    展示所有包含已下载章节的本子，使用卡片式布局
    """
    # 筛选出至少有一章已下载的本子，去重，按更新时间倒序
    albums_queryset = Album.objects.filter(photos__is_downloaded=True).distinct().order_by('-created_at')

    # 分页：每页 12 个本子 (3x4 或 4x3 布局)
    paginator = Paginator(albums_queryset, 12)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    context = {
        'page_obj': page_obj,
    }
    # 注意：这里使用新设计的模板名称
    return render(request, 'comic/jm_album_list.html', context)


# ----------------------------------------------------
# 2. 本子详情页
# ----------------------------------------------------
@login_required
def jm_album_detail_view(request, pk):
    """
    展示本子详情及章节列表
    """
    album = get_object_or_404(Album, pk=pk)

    # 获取该本子下所有已下载的章节，按序号排序
    photos = album.photos.filter(is_downloaded=True).order_by('sort_index')

    context = {
        'album': album,
        'photos': photos,
    }
    return render(request, 'comic/jm_album_detail.html', context)


# ----------------------------------------------------
# 3. 删除本子逻辑 (数据库 + 文件)
# ----------------------------------------------------
@login_required
def album_delete_view(request, pk):
    """
    删除本子：
    1. 删除硬盘上的文件夹
    2. 删除数据库记录
    """
    if request.method != 'POST':
        return HttpResponseForbidden("只允许 POST 请求")

    album = get_object_or_404(Album, pk=pk)

    # --- 步骤 A: 删除文件系统中的文件 ---
    # 根据爬虫逻辑构建路径: media/images/jmcomic/[safe_name]
    safe_name = sanitize_filename(album.name)
    album_dir = os.path.join(settings.MEDIA_ROOT, 'images', 'jmcomic', safe_name)

    if os.path.exists(album_dir) and os.path.isdir(album_dir):
        try:
            shutil.rmtree(album_dir)  # 递归删除文件夹及其内容
            print(f"已物理删除文件夹: {album_dir}")
        except Exception as e:
            print(f"删除文件夹失败: {e}")
            # 这里即使文件删除失败，通常也继续删除数据库记录，避免死循环
    else:
        print(f"文件夹不存在，跳过物理删除: {album_dir}")

    # --- 步骤 B: 删除数据库记录 ---
    # 由于 Photo 设置了 on_delete=models.CASCADE，删除 Album 会自动删除关联的 Photo
    album_name = album.name
    album.delete()

    print(f"已删除数据库记录: {album_name}")

    return redirect('jm_album_list')


# ----------------------------------------------------
# 4. 章节阅读页 (含核心导航逻辑)
# ----------------------------------------------------
@login_required
def jm_photo_detail_view(request, pk):
    """
    章节阅读器：展示图片流，计算上一章/下一章
    """
    photo = get_object_or_404(Photo, pk=pk)
    album = photo.album

    # --- 步骤 A: 读取本地图片文件 ---
    # photo.save_path 是相对路径，例如: images/jmcomic/AlbumName/PhotoName
    if photo.save_path:
        full_dir_path = os.path.join(settings.MEDIA_ROOT, photo.save_path)
    else:
        full_dir_path = ""

    image_files = []
    if os.path.exists(full_dir_path) and os.path.isdir(full_dir_path):
        # 获取所有图片文件
        files = [f for f in os.listdir(full_dir_path) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))]

        # 自然排序 (1.jpg, 2.jpg, 10.jpg...)
        files.sort(key=lambda x: [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', x)])

        # 构造完整 URL
        for f in files:
            # 拼接: /media/ + images/jmcomic/.../1.jpg
            # replace('\\', '/') 是为了兼容 Windows 路径分隔符
            url = os.path.join(settings.MEDIA_URL, photo.save_path, f).replace('\\', '/')
            image_files.append(url)

    # --- 步骤 B: 计算上一章 / 下一章 ---
    # 获取同本子下所有的章节
    siblings = Photo.objects.filter(album=album).order_by('sort_index')

    # 逻辑：查找 sort_index 比当前小(大)的章节中，最靠近的一个

    # 上一章：序号比当前小，倒序取第一个
    prev_photo = siblings.filter(sort_index__lt=photo.sort_index).last()

    # 下一章：序号比当前大，正序取第一个
    next_photo = siblings.filter(sort_index__gt=photo.sort_index).first()

    context = {
        'photo': photo,
        'image_files': image_files,
        'prev_photo': prev_photo,
        'next_photo': next_photo,
    }
    return render(request, 'comic/jm_photo_detail.html', context)


# ----------------------------------------------------
# 模块二：爬取指令
# ----------------------------------------------------

@login_required
def start_crawl_view(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    input_text = request.POST.get('input_id')

    # 1. 解析类型和ID
    # 这里的 parse_jm_input 是您之前在 utils.py 里写的那个
    jm_type, jm_id = parse_jm_input(input_text)

    if not jm_id:
        return JsonResponse({'error': '无效链接或ID'}, status=400)

    # 2. 直接触发异步任务
    # 我们不在视图里做复杂的数据库检查，让 Celery 任务去处理 update_or_create
    # 这样用户体验更快
    task = crawl_jm_task.delay(jm_type, jm_id)

    return JsonResponse({
        'status': 'success',
        'message': f'任务已提交: {jm_type} - {jm_id}',
        'task_id': task.id
    })

# ----------------------------------------------------
# 模块三：爬取内容展示
# ----------------------------------------------------


@login_required
def album_detail_view(request, pk):
    album = get_object_or_404(Album, pk=pk, is_downloaded=True)
    full_path = os.path.join(settings.MEDIA_ROOT, album.download_path)
    image_files = []

    if os.path.isdir(full_path):
        files = sorted(os.listdir(full_path),
                       key=lambda x: [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', x)])
        for filename in files:
            if filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                relative_url = os.path.join(settings.MEDIA_URL, album.download_path, filename).replace(os.path.sep, '/')
                image_files.append(relative_url)

    context = {'album': album, 'image_files': image_files}
    return render(request, 'comic/album_detail.html', context)


# ----------------------------------------------------
# 模块三：本地模块展示
# ----------------------------------------------------
@login_required
def local_media_view(request):
    """
    展示 media/images/local 和 media/videos 下的子文件夹列表
    """
    base_dir = Path(settings.MEDIA_ROOT)
    local_images_dir = base_dir / 'images' / 'local'
    image_albums = []

    if local_images_dir.exists():
        for folder in local_images_dir.iterdir():
            if folder.is_dir():
                cover_url = None
                image_count = 0

                # 寻找并排序所有图片文件
                image_files = []
                for f in folder.iterdir():
                    if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                        image_files.append(f)

                # 对文件名进行自然排序，确保 "第一张" 准确
                image_files.sort(key=lambda x: [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', x.name)])

                image_count = len(image_files)

                # !!! 关键修正：将第一张图片设置为封面 !!!
                if image_files:
                    first_file = image_files[0]
                    # 构造 MEDIA_URL 相对路径: /media/images/local/文件夹名/文件名
                    cover_url = f"{settings.MEDIA_URL}images/local/{folder.name}/{first_file.name}"

                image_albums.append({
                    'name': folder.name,
                    'count': image_count,
                    'cover_url': cover_url,
                    'folder_name': folder.name
                })

    # 2. 扫描视频文件夹
    local_videos_dir = base_dir / 'videos'
    video_folders = []

    if local_videos_dir.exists():
        for folder in local_videos_dir.iterdir():
            if folder.is_dir():
                video_count = sum(1 for f in folder.iterdir() if f.suffix.lower() in ['.mp4', '.webm', '.mov'])
                video_folders.append({
                    'name': folder.name,
                    'count': video_count,
                    'folder_name': folder.name
                })

    context = {
        'image_albums': image_albums,
        'video_folders': video_folders,
    }
    return render(request, 'comic/local_media.html', context)


# ----------------------------------------------------
# 模块三：本地模块 - 详情页 (展示具体文件)
# ----------------------------------------------------
IMAGE_PER_PAGE = 300 # 每页显示 300 张图片
@login_required
def local_media_detail_view(request, type, folder_name):
    """
    展示具体文件夹内的图片或视频
    :param type: 'images' 或 'videos'
    :param folder_name: 文件夹名称
    """
    base_dir = Path(settings.MEDIA_ROOT)

    if type == 'images':
        target_dir = base_dir / 'images' / 'local' / folder_name
        valid_exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
        template_name = 'comic/local_images_detail.html'  # 图片专用模板
    elif type == 'videos':
        target_dir = base_dir / 'videos' / folder_name
        valid_exts = ['.mp4', '.webm', '.mov', '.mkv']
        template_name = 'comic/local_videos_detail.html'  # 视频专用模板
    else:
        return redirect('local_media')

    if not target_dir.exists():
        return render(request, 'comic/error.html', {'message': '文件夹不存在'})

    files = []
    # 获取所有符合后缀的文件
    raw_files = [f for f in target_dir.iterdir() if f.is_file() and f.suffix.lower() in valid_exts]

    # 文件名自然排序 (1.jpg, 2.jpg, 10.jpg)
    raw_files.sort(key=lambda x: [int(c) if c.isdigit() else c for c in re.split(r'(\d+)', x.name)])

    for f in raw_files:
        # 构造 URL
        if type == 'images':
            url = f"{settings.MEDIA_URL}images/local/{folder_name}/{f.name}"
        else:
            url = f"{settings.MEDIA_URL}videos/{folder_name}/{f.name}"

        files.append({
            'name': f.name,
            'url': url
        })

    if type == 'images':
        paginator = Paginator(files, IMAGE_PER_PAGE)

        page_number = request.GET.get('page')
        jump_to_index = request.GET.get('jump')
        target_jump_index = None  # 新增：用于告诉模板要滚动到哪张图

        if jump_to_index:
            try:
                # 1. 计算目标页码
                jump_index = max(1, int(jump_to_index))
                # 确保不超过总数
                jump_index = min(jump_index, len(files))

                target_page = ((jump_index - 1) // IMAGE_PER_PAGE) + 1
                page_number = target_page

                # 2. 记录目标索引，传给模板
                target_jump_index = jump_index
            except ValueError:
                pass

        page_obj = paginator.get_page(page_number)

        # 获取当前页第一张图片在全局的序号 (例如第2页第一张是第301张)
        # page_obj.start_index() 返回的是 1-based 索引
        start_index = page_obj.start_index() if page_obj.start_index() else 1

        context = {
            'folder_name': folder_name,
            'type': type,
            'page_obj': page_obj,
            'files': page_obj.object_list,
            'count': paginator.count,
            'start_index': start_index,
            'total_pages': paginator.num_pages,
            'current_page': page_obj.number,
            # 传给模板的新变量
            'target_jump_index': target_jump_index,
        }
        return render(request, template_name, context)
    # videos
    context = {
        'folder_name': folder_name,
        'type': type,
        'files': files,
        'count': len(files)
    }
    return render(request, template_name, context)

@login_required
def home_view(request):
    """
    网站入口：导航枢纽
    """
    return render(request, 'comic/home.html')

@login_required
def crawl_page_view(request):
    """
    独立的爬取指令页面
    """
    return render(request, 'comic/crawl_form.html')


# ----------------------------------------------------
# 模块五：在线搜索模块
# ----------------------------------------------------
@login_required
def search_view(request):
    """
    在线搜索总览页：支持关键字和标签搜索
    """
    query = request.GET.get('q', '').strip()
    search_type = request.GET.get('type', 'keyword')  # keyword 或 tag
    page_num = int(request.GET.get('page', 1))

    results = []
    pagination = {}
    error_msg = None

    if query:
        try:
            # 根据类型调用不同的 API
            jm_page: JmSearchPage = None

            if search_type == 'tag':
                jm_page = client.search_tag(search_query=query, page=page_num)
            else:
                # 默认关键字搜索
                jm_page = client.search_site(search_query=query, page=page_num)

            # 处理搜索结果
            # page.content 结构: [(album_id, info_dict), ...]
            for album_id, info in jm_page.content:
                # 1. 检查本地是否已下载 (查询 Album 库)
                # 只要数据库有记录且 photos 有已下载的，就算已存在
                is_downloaded = Album.objects.filter(jm_id=album_id, photos__is_downloaded=True).exists()

                # 2. 格式化时间戳
                update_time = "未知"
                if 'update_at' in info and info['update_at']:
                    try:
                        ts = int(info['update_at'])
                        update_time = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                    except:
                        pass

                # 3. 获取封面
                cover_url = JmcomicText.get_album_cover_url(album_id)

                results.append({
                    'jm_id': album_id,
                    'name': info.get('name', '未知标题'),
                    'author': info.get('author', ''),
                    'tags': info.get('tags', []),
                    'description': info.get('description', ''),
                    'update_time': update_time,
                    'cover_url': cover_url,
                    'is_downloaded': is_downloaded,
                    'category': info.get('category', {}).get('title', ''),
                })

            # 分页数据
            pagination = {
                'current': page_num,
                'total': jm_page.total,
                'page_count': jm_page.page_count,
                'has_prev': page_num > 1,
                'has_next': page_num < jm_page.page_count,
                'prev_num': page_num - 1,
                'next_num': page_num + 1
            }

        except Exception as e:
            error_msg = f"搜索出错: {str(e)}"
            print(f"Search Error: {e}")

    context = {
        'query': query,
        'search_type': search_type,
        'results': results,
        'pagination': pagination,
        'error_msg': error_msg,
    }
    return render(request, 'comic/search.html', context)


@login_required
def search_detail_view(request, jm_id):
    """
    搜索详情页：展示详细信息并提供下载按钮
    注意：这里我们实际上可以直接重用 search_view 里的数据，
    或者再次调用 client.get_album_detail(jm_id) 获取更详细数据。
    为了展示更丰富的信息，我们选择调用 get_album_detail。
    """
    try:

        album_detail = client.get_album_detail(jm_id)

        # 检查本地状态
        local_album = Album.objects.filter(jm_id=jm_id).first()
        is_downloaded = local_album.photos.filter(is_downloaded=True).exists() if local_album else False

        # 处理作者 (API可能是列表或字符串)
        author = "未知"
        if hasattr(album_detail, 'authors') and album_detail.authors:
            author = ",".join(album_detail.authors)
        elif hasattr(album_detail, 'author'):
            author = album_detail.author

        # 封面 URL
        cover_url = JmcomicText.get_album_cover_url(jm_id)

        context = {
            'album': {
                'jm_id': jm_id,
                'name': album_detail.name,
                'author': author,
                'description': getattr(album_detail, 'description', '暂无简介'),
                'tags': getattr(album_detail, 'tags', []),
                'actors': getattr(album_detail, 'actors', []),
                'cover_url': cover_url,
                'episode_count': len(album_detail.episode_list) if hasattr(album_detail, 'episode_list') else 0,
            },
            'is_downloaded': is_downloaded,
        }
        return render(request, 'comic/search_detail.html', context)

    except Exception as e:
        return render(request, 'comic/error.html', {'message': f"获取详情失败: {str(e)}"})