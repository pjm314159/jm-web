import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

import ThemeToggle from './ThemeToggle'

interface NavbarProps {
  isDark: boolean
  onToggleTheme: () => void
  /** 阅读页沉浸模式：隐藏导航栏 */
  hidden?: boolean
}

/**
 * 顶部导航栏（参考 XinghuisamaBlogs 的 Navbar PC 端）：
 * - 固定顶部、半透明 + backdrop-blur-xl 毛玻璃、底部细边框
 * - 未登录：仅显示网站名与白天/黑夜切换（design.md 要求）
 * - 已登录：显示导航链接（鼠标聚焦效果：上浮 + 渐变下划线 + 光晕）+ 液态玻璃登出按钮
 */
export default function Navbar({ isDark, onToggleTheme, hidden = false }: NavbarProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // 导航链接（首页 + 四个功能页占位路由）
  const navLinks = [
    { name: '首页', to: '/' },
    { name: '在线搜索', to: '/search' },
    { name: '爬虫中心', to: '/crawl' },
    { name: '藏书阁', to: '/library' },
    { name: '本地资源', to: '/local' },
  ]

  if (hidden) return null

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-white/40 shadow-sm backdrop-blur-xl transition-colors duration-500 dark:border-white/5 dark:bg-slate-900/50">
      <div className="mx-auto flex h-16 w-[90%] max-w-6xl items-center justify-between px-4">
        <Link
          to="/"
          className="text-xl font-black tracking-tighter text-slate-800 transition-colors duration-300 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
        >
          JmComic
          <span className="mx-0.5 text-indigo-500">·</span>
          Web
        </Link>

        {/* 导航链接：登录后显示，带鼠标聚焦效果 */}
        {isAuthenticated && (
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.to}
                className={`nav-link ${pathname === link.to ? 'nav-link-active' : ''}`}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          {isAuthenticated && (
            <button type="button" onClick={handleLogout} className="glass-btn glass-btn-sm">
              <span className="glass-btn-overlay" />
              <span className="glass-btn-text">退出登录</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
