# user/views.py

from django.shortcuts import render, redirect
# 移除：from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import login
from django.conf import settings

# 导入您自定义的表单
from .forms import CustomUserCreationForm


def register_view(request):
    if request.user.is_authenticated:
        return redirect('index')

    if request.method == 'POST':
        # !!! 使用 CustomUserCreationForm !!!
        form = CustomUserCreationForm(request.POST)
        secret_key = request.POST.get('secret_key')

        # 1. 密钥校验
        if secret_key != settings.REGISTRATION_SECRET_KEY:
            return render(request, 'user/register.html', {
                'form': form,
                'error': '注册密钥错误。'
            })

        # 2. 表单校验
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('index')

        # 3. 表单校验失败
        return render(request, 'user/register.html', {
            'form': form,
            'error': '注册信息校验失败，请检查用户名格式或密码是否一致。'
        })

    else:
        # GET 请求，初始化 CustomUserCreationForm
        form = CustomUserCreationForm()

    return render(request, 'user/register.html', {'form': form})