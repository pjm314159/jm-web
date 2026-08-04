我需要添加一个功能，查看评论的功能，在这有使用[示例](../.temp/tags.py)，在搜索的详情页的最下方添加评论的展示，往下滚展示更多的信息。样式采用b站的样式为基础，融合原有的风格，使用mcp打开https://manga.bilibili.com/detail/mc24442?from=manga_homepage_recommend,查看b站评论样式

把[search](..\frontend\src\pages\SearchDetailPage.tsx)的`查看本地详情`的按钮为本页面打开不要跳转，
把[文件](../frontend/src/pages/LibraryDetailPage.tsx)的`删除`按钮删除后时不要跳转，改为关闭本页面