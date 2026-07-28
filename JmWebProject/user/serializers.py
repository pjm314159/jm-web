"""user 模块序列化器：注册入参校验。

校验逻辑对齐旧版 CustomUserCreationForm + 密钥校验：
- 注册密钥必须匹配 settings.REGISTRATION_SECRET_KEY；
- 用户名格式（UnicodeUsernameValidator）与唯一性；
- 密码强度（Django AUTH_PASSWORD_VALIDATORS）；
- 两次密码一致。
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    """注册入参：username / password / password2 / secret_key。"""

    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    secret_key = serializers.CharField(write_only=True)

    def validate_secret_key(self, value):
        if value != settings.REGISTRATION_SECRET_KEY:
            raise serializers.ValidationError("注册密钥错误。")
        return value

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("该用户名已被注册。")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password2": "两次输入的密码不一致。"})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )
