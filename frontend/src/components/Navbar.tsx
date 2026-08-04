import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

import ThemeToggle from './ThemeToggle'

/* ─── 移动端图标 ─────────────────────────────── */
function LogoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}
function MenuIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
function CloseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function LogoutIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
    </svg>
  )
}

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
  const [menuOpen, setMenuOpen] = useState(false)

  // 路由切换后自动收起移动端菜单
  useEffect(() => setMenuOpen(false), [pathname])

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
          className="flex items-center text-slate-800 transition-colors duration-300 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
        >
          {/* 小屏：图标代替站名 */}
          <LogoIcon className="h-7 w-7 text-indigo-500 md:hidden" />
          <span className="hidden text-xl font-black tracking-tighter md:inline">
            JmComic
            <span className="mx-0.5 text-indigo-500">·</span>
            Web
          </span>
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

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          {isAuthenticated && (
            <>
              {/* 中大屏：液态玻璃文字登出按钮（.glass-btn 自带 display 会覆盖 hidden，需用包裹层控制显隐） */}
              <span className="hidden sm:flex">
                <button type="button" onClick={handleLogout} className="glass-btn glass-btn-sm">
                  <span className="glass-btn-overlay" />
                  <span className="glass-btn-text">退出登录</span>
                </button>
              </span>
              {/* 小屏：SVG 登出（与登出按钮同一 glass-btn 样式） */}
              <span className="sm:hidden">
                <button
                  type="button"
                  aria-label="退出登录"
                  onClick={handleLogout}
                  className="glass-btn glass-btn-sm !px-2.5 !py-2"
                >
                  <span className="glass-btn-overlay" />
                  <LogoutIcon className="relative z-10 h-5 w-5 text-slate-600 dark:text-slate-300" />
                </button>
              </span>
              {/* 小屏：菜单按钮（下拉导航，同一 glass-btn 样式） */}
              <span className="md:hidden">
                <button
                  type="button"
                  aria-label="菜单"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="glass-btn glass-btn-sm !px-2.5 !py-2"
                >
                  <span className="glass-btn-overlay" />
                  {menuOpen ? (
                    <CloseIcon className="relative z-10 h-5 w-5 text-slate-600 dark:text-slate-300" />
                  ) : (
                    <MenuIcon className="relative z-10 h-5 w-5 text-slate-600 dark:text-slate-300" />
                  )}
                </button>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 移动端下拉导航（小屏代替顶部链接行） */}
      {isAuthenticated && (
        <div
          className={`overflow-hidden transition-all duration-300 ease-out md:hidden ${
            menuOpen ? 'max-h-80 border-t border-white/20 dark:border-white/5' : 'max-h-0'
          }`}
        >
          <nav className="flex flex-col gap-1 px-6 pb-3 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.to}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                  pathname === link.to
                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600 hover:bg-white/50 dark:text-slate-300 dark:hover:bg-slate-800/50'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
