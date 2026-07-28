import { useEffect, useState } from 'react'

const STORAGE_KEY = 'jm-theme'

/** 同步读取当前应为黑夜还是白天（默认黑夜，与 index.html 内联脚本一致）。 */
function readIsDark(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'light'
  } catch {
    return true
  }
}

/**
 * 主题切换 hook（参考 XinghuisamaBlogs 的 ThemeProvider）：
 * - 惰性初始化同步读 localStorage，首屏状态与 index.html 预设一致，避免闪烁
 * - 读写 localStorage 持久化
 * - 通过 html.dark class 驱动 Tailwind dark: 与自定义 CSS
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(readIsDark)

  // 同步 html.dark class（路由切换/切换主题时保证不丢失）
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
      return next
    })
  }

  return { isDark, toggleTheme }
}
