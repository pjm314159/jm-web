"""user 模块 DRF 视图：注册（自动签发 JWT）与登出（refresh 拉黑）。

token 获取/刷新使用 simplejwt 内置视图（见 user/urls.py）。
"""

import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer

logger = logging.getLogger(__name__)


class RegisterView(APIView):
    """注册：密钥校验 + 创建用户 + 自动签发 JWT（对齐旧版注册后自动登录）。"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        logger.info("用户注册成功: %s", user.username)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "username": user.username,
            },
            status=status.HTTP_201_CREATED,
        )


class LogoutView(APIView):
    """登出：将 refresh token 拉黑，使其无法再用于刷新。"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response({"detail": "缺少 refresh token。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            logger.warning("登出失败：refresh token 无效或已拉黑")
            return Response({"detail": "refresh token 无效。"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_205_RESET_CONTENT)
