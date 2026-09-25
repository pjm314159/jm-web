"""Django settings 包。

按环境拆分，通过 DJANGO_SETTINGS_MODULE 选择：

- 开发（本地缺省）：``JmWebProject.settings.dev``
- 生产（Docker 镜像内置 ENV）：``JmWebProject.settings.prod``
- 测试（pytest / CI）：``JmWebProject.settings.test``

本 ``__init__.py`` 不做任何导入，避免与子模块重复执行设置代码。
"""
