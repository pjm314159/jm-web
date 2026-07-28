"""自定义日志工具：按日轮转 + gzip 压缩打包。

轮转后文件命名：jmweb.log.2026-07-28.gz
保留 backupCount 天的压缩包，超期自动删除。
"""

import contextlib
import gzip
import os
import shutil
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path


class CompressedTimedRotatingFileHandler(TimedRotatingFileHandler):
    """TimedRotatingFileHandler 扩展：轮转时自动将旧日志压缩为 .gz。

    - 当前日志始终写入 filename（如 logs/jmweb.log）
    - 每日午夜轮转，旧文件压缩为 logs/jmweb.log.2026-07-28.gz
    - backupCount 控制保留天数，超期压缩包自动清理
    - Windows 下轮转失败（文件被占用）时静默跳过，不阻塞服务
    """

    def doRollover(self):
        """执行轮转：关闭当前流 → 重命名 → 压缩 → 清理过期文件。"""
        if self.stream:
            self.stream.close()
            self.stream = None  # type: ignore[assignment]

        # 计算轮转目标文件名（带日期后缀）
        current_time = int(time.time())
        dst_now = time.localtime(current_time)[-1]
        t = self.rolloverAt - self.interval
        if self.utc:
            time_tuple = time.gmtime(t)
        else:
            time_tuple = time.localtime(t)
            dst_then = time_tuple[-1]
            if dst_now != dst_then:
                addend = 3600 if dst_now else -3600
                time_tuple = time.localtime(t + addend)

        date_str = time.strftime(self.suffix, time_tuple)
        dfn = self.rotation_filename(f"{self.baseFilename}.{date_str}")

        # 轮转：如果目标已存在则先删除（避免 Windows 重命名失败）
        if os.path.exists(dfn):
            os.remove(dfn)
        if os.path.exists(self.baseFilename):
            # Windows 下文件被其他进程打开时无法重命名，跳过本次轮转
            with contextlib.suppress(OSError):
                os.rename(self.baseFilename, dfn)

        # 压缩为 .gz
        gz_path = f"{dfn}.gz"
        if os.path.exists(dfn):
            try:
                with open(dfn, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
                os.remove(dfn)  # 压缩成功后删除原始文件
            except OSError:
                pass  # 压缩失败保留原始文件

        # 清理过期压缩包
        if self.backupCount > 0:
            self._delete_old_files()

        # 打开新的日志文件
        if not self.delay:
            self.stream = self._open()

        # 计算下次轮转时间
        new_rollover_at = self.computeRollover(current_time)
        while new_rollover_at <= current_time:
            new_rollover_at += self.interval
        if self.utc:
            time_tuple = time.gmtime(new_rollover_at)
        else:
            time_tuple = time.localtime(new_rollover_at)
            dst_at_rollover = time_tuple[-1]
            if dst_now != dst_at_rollover:
                addend = -3600 if dst_now else 3600
                new_rollover_at += addend
        self.rolloverAt = new_rollover_at

    def _delete_old_files(self):
        """删除超过 backupCount 的 .gz 压缩包。"""
        base_dir = Path(self.baseFilename).parent
        prefix = f"{Path(self.baseFilename).name}."
        gz_files = sorted(
            f for f in base_dir.iterdir() if f.name.startswith(prefix) and f.name.endswith(".gz")
        )
        # 保留最新的 backupCount 个
        for old_file in gz_files[: -self.backupCount]:
            with contextlib.suppress(OSError):
                old_file.unlink()
