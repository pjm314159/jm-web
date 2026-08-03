"""ComicConfig.ready() 启动预热守卫测试。

验证：仅服务类命令触发 jmcomic 客户端预热，
test/migrate 等命令跳过，预热异常不影响启动。
"""

from unittest.mock import patch

from comic.apps import ComicConfig


class TestWarmupGuard:
    def test_skip_in_pytest(self):
        """测试进程不预热（避免每个测试进程发起真实网络请求）。"""
        with patch("comic.apps.sys.argv", ["/x/pytest", "tests/"]):
            with patch("comic.services.jm_async.init_client") as m:
                ComicConfig._warmup_jm_client()
                m.assert_not_called()

    def test_skip_for_manage_non_serve_command(self):
        """migrate/shell 等 manage.py 命令不预热。"""
        for cmd in ("migrate", "shell", "createsuperuser"):
            with patch("comic.apps.sys.argv", ["manage.py", cmd]):
                with patch("comic.services.jm_async.init_client") as m:
                    ComicConfig._warmup_jm_client()
                    m.assert_not_called()

    def test_warmup_for_runserver(self):
        """runserver 触发预热。"""
        with patch("comic.apps.sys.argv", ["manage.py", "runserver"]):
            with patch("comic.services.jm_async.init_client") as m:
                ComicConfig._warmup_jm_client()
                m.assert_called_once()

    def test_warmup_for_gunicorn_entry(self):
        """WSGI/ASGI 入口（非 manage.py，如 gunicorn/uvicorn worker）触发预热。"""
        with patch("comic.apps.sys.argv", ["/x/gunicorn", "JmWebProject.wsgi"]):
            with patch("comic.services.jm_async.init_client") as m:
                ComicConfig._warmup_jm_client()
                m.assert_called_once()

    def test_warmup_error_does_not_raise(self):
        """预热调度失败仅记日志，不阻断启动。"""
        with patch("comic.apps.sys.argv", ["manage.py", "runserver"]):
            with patch("comic.services.jm_async.init_client", side_effect=RuntimeError("boom")):
                ComicConfig._warmup_jm_client()  # 不应抛出
