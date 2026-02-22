# comic/models.py
from django.db import models


class Album(models.Model):
    """
    本子信息
    对应 client.get_album_detail()
    """
    jm_id = models.CharField(max_length=50, unique=True, verbose_name="JM ID")
    name = models.CharField(max_length=255, verbose_name="本子名称", default="未知")
    author = models.CharField(max_length=255, blank=True, null=True, verbose_name="作者")
    # 将 list 类型的 tags 和 actors 存为 JSON
    tags = models.JSONField(default=list, blank=True, verbose_name="标签列表")
    actors = models.JSONField(default=list, blank=True, verbose_name="角色列表")
    description = models.TextField(blank=True, null=True, verbose_name="描述")

    # 状态
    total_episodes = models.IntegerField(default=0, verbose_name="总章节数")
    created_at = models.DateTimeField(auto_now_add=True)

    # 封面 (由于API不直接提供图片URL，我们可能需要下载第一张图或手动处理，这里先预留字段)
    cover_path = models.CharField(max_length=512, blank=True, null=True)

    def __str__(self):
        return self.name


class Photo(models.Model):
    """
    章节信息
    对应 client.get_photo_detail() 或 album.episode_list 中的项
    """
    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name='photos')
    jm_id = models.CharField(max_length=50, unique=True, verbose_name="章节 ID")
    name = models.CharField(max_length=255, verbose_name="章节名称")
    sort_index = models.IntegerField(default=0, verbose_name="章节序号")  # 对应 episode_list 中的 '1'
    # 下载状态
    is_downloaded = models.BooleanField(default=False)
    save_path = models.CharField(max_length=512, blank=True, null=True, verbose_name="保存路径")

    class Meta:
        ordering = ['sort_index']

    def __str__(self):
        return self.name