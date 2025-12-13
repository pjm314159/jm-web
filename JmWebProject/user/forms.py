# user/forms.py
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import get_user_model

# 使用 get_user_model() 安全地获取您的自定义用户模型 (user.User)
User = get_user_model()

class CustomUserCreationForm(UserCreationForm):
    """
    继承自 UserCreationForm，并明确指向我们自定义的 User 模型。
    """
    class Meta(UserCreationForm.Meta):
        model = User
        # 仅包含您希望在注册页显示的字段
        fields = ('username',)
        # 注意：AbstractUser 默认包含 username 和 email 字段