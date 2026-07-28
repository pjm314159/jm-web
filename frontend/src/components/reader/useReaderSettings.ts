/**
 * 阅读设置 hook（localStorage 持久化）：
 * - 背景模式：default（跟随全局主题+装饰）| black（纯黑无装饰）| gray（深灰无装饰）
 * - 所有阅读页共用同一份设置，无需每次重新配置
 */
import { useCallback, useState } from 'react'

export type ReaderBg = 'default' | 'black' | 'gray'

const STORAGE_KEY = 'jm-reader-settings'

interface ReaderSettings {
  bg: ReaderBg
}

function load(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReaderSettings>
      return { bg: parsed.bg ?? 'default' }
    }
  } catch { /* ignore */ }
  return { bg: 'default' }
}

function save(settings: ReaderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(load)

  const setBg = useCallback((bg: ReaderBg) => {
    setSettings((prev) => {
      const next = { ...prev, bg }
      save(next)
      return next
    })
  }, [])

  return { bg: settings.bg, setBg }
}

/** 根据背景模式返回页面容器 className（覆盖全局 demo-bg）。 */
export function readerBgClass(bg: ReaderBg): string {
  switch (bg) {
    case 'black':
      return '!bg-black'
    case 'gray':
      return '!bg-neutral-900'
    default:
      return ''
  }
}
