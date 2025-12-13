from django.db import models

# user/models.py
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    # 继承了默认的 username, password, email 等字段
    # pass
    pass
