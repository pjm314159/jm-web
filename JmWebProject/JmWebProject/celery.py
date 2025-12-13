# JmWebProject/JmWebProject/celery.py
import os
from celery import Celery

# 设置 Django 环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'JmWebProject.settings')

# 创建 Celery 应用实例
app = Celery('JmWebProject')

# 从 settings 文件中加载配置 (所有 CELERY_ 开头的配置)
app.config_from_object('django.conf:settings', namespace='CELERY')

# 自动从已安装的 Django app 中发现任务 (tasks.py)
app.autodiscover_tasks()