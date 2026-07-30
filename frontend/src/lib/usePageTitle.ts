import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const BASE = 'JmComic'

/** 命令式设置标签页标题（供页面组件在数据加载后调用）。 */
export function setPageTitle(name: string) {
  document.title = `${name} - ${BASE}`
}

/** 根据当前路由自动设置浏览器标签页标题（静态路由）。 */
export function usePageTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    let title = ''

    if (pathname === '/') title = '首页'
    else if (pathname === '/login') title = '登录'
    else if (pathname === '/register') title = '注册'
    else if (pathname === '/search') title = '在线搜索'
    else if (pathname === '/crawl') title = '爬虫中心'
    else if (pathname === '/library') title = '藏书阁'
    else if (pathname === '/library/search') title = '高级搜索'
    else if (pathname === '/local') title = '本地资源'
    else if (pathname === '/local/images') title = '本地图片'
    else if (pathname === '/local/videos') title = '本地视频'
    else if (!pathname.startsWith('/search/') && !pathname.startsWith('/library/') && !pathname.startsWith('/local/')) title = '页面不存在'

    // 动态路由（详情/阅读页）由页面组件自行设置具体名称，此处不覆盖
    if (title) document.title = `${title} - ${BASE}`
  }, [pathname])
}
