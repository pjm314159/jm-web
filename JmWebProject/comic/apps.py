import logging
import sys

from django.apps import AppConfig

logger = logging.getLogger(__name__)

# 只在真正运行服务器的命令下预热客户端，migrate/test/shell 等命令跳过
_SERVE_COMMANDS = {"runserver", "runworker", "daphne", "uvicorn", "gunicorn"}


class ComicConfig(AppConfig):
    name = "comic"

    def ready(self):
        self._warmup_jm_client()

    @staticmethod
    def _warmup_jm_client() -> None:
        """服务启动时异步预创建全局 jmcomic 客户端（非阻塞，失败不影响启动）。

        客户端创建含 HTTP 请求（耗时 1-2s），若懒初始化会让首次
        搜索/详情请求承担全部建连开销，故在启动阶段提前预热。
        测试环境下跳过，避免每个测试进程都发起真实网络请求。
        """
        argv = sys.argv
        is_test = "test" in argv or "pytest" in (argv[0] if argv else "").lower()
        is_manage_cmd = "manage.py" in (argv[0] if argv else "") and (
            len(argv) < 2 or argv[1] not in _SERVE_COMMANDS
        )
        if is_test or is_manage_cmd:
            return
        try:
            from comic.services.jm_async import init_client

            init_client()
            logger.info("已提交 jmcomic 客户端启动预热任务")
        except Exception as e:
            logger.warning("jmcomic 客户端启动预热调度失败: %s", e)
