interface ThemeToggleProps {
  isDark: boolean
  onToggle: () => void
}

/**
 * 白天/黑夜切换按钮（参考 XinghuisamaBlogs 的 ThemeToggleBlock）：
 * - 圆形容器内两层渐变背景上下滑动（白天 sky→yellow / 黑夜 indigo→slate）
 * - 太阳/月亮图标随切换 rotate + scale + opacity 交替
 * - 按 design.md 要求，图标使用 SVG（禁止 emoji）
 */
export default function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="切换白天/黑夜模式"
      className="relative h-11 w-11 flex-shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/50 shadow-inner transition-transform duration-300 hover:scale-110 active:scale-95 dark:border-white/10"
    >
      {/* 白天渐变层 */}
      <div
        className={`absolute inset-0 bg-gradient-to-tr from-sky-300 to-yellow-200 transition-transform duration-700 ease-in-out ${
          isDark ? '-translate-y-full' : 'translate-y-0'
        }`}
      />
      {/* 黑夜渐变层 */}
      <div
        className={`absolute inset-0 bg-gradient-to-tr from-indigo-900 to-slate-800 transition-transform duration-700 ease-in-out ${
          isDark ? 'translate-y-0' : 'translate-y-full'
        }`}
      />
      {/* 太阳图标（白天显示） */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
          isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-6 w-6 drop-shadow"
        >
          <circle cx="12" cy="12" r="4" fill="#fbbf24" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </div>
      {/* 月亮图标（黑夜显示） */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
        }`}
      >
        <svg viewBox="0 0 24 24" fill="#e2e8f0" className="h-5 w-5 drop-shadow">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>
    </button>
  )
}
