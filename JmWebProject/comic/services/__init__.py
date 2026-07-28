"""comic 业务层（services）。

分层约束（见 docs/design.md 3）：
- views 只解析请求与组装响应，不直接 import jmcomic、不写业务逻辑；
- services 负责业务编排（缓存、数据库、jmcomic 调用），不感知 HTTP 请求对象；
- jm_sync / jm_async 是 jmcomic 客户端的唯一入口。
"""
