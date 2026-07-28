/**
 * 漫画阅读页共享壳组件（正式版，UI 形态来自 demo 定稿）：
 * - 主题切换/背景复用全局（ThemeToggle + demo-bg），阅读页自身隐藏 Navbar
 * - 图片流 window 滚动一页到底、无缝拼接；点击图片流切换工具栏显隐
 * - 章内分页（300 图/页）+ 页码选择跳转（合并进 x/y 显示）
 * - 液态玻璃 + 星星装饰；选中态统一蓝色
 */
import { useEffect, useState } from 'react'
import ThemeToggle from '../ThemeToggle'
import type { ReaderBg } from './useReaderSettings'

/** 章内分页尺寸（与后端一致：300 图/页） */
export const IMAGES_PER_PAGE = 300

/* ─── 图标 ──────────────────────────────────────────────── */
export function ArrowLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  )
}
export function ChevronLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
export function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
export function ChevronUpIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  )
}
export function ListIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
}
export function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

/** 四角闪烁星（装饰动效；定位由使用处决定）。 */
export function SparkleStar({ className = '', delay = '0s' }: { className?: string; delay?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`twinkle-star pointer-events-none ${className}`}
      style={{ animationDelay: delay }}
    >
      <path d="M12 0c.5 6.5 5.5 11.5 12 12-6.5.5-11.5 5.5-12 12-.5-6.5-5.5-11.5-12-12C6.5 11.5 11.5 6.5 12 0z" />
    </svg>
  )
}

/** 底部导航栏星星装饰配置。 */
const NAV_STARS: { className: string; delay: string }[] = [
  { className: 'left-3 top-1.5 h-3.5 w-3.5 text-indigo-400/70', delay: '0s' },
  { className: 'left-[18%] bottom-1 h-2.5 w-2.5 text-purple-400/60', delay: '0.7s' },
  { className: 'left-[32%] top-1 h-3 w-3 text-sky-400/60', delay: '1.6s' },
  { className: 'left-1/2 bottom-0.5 h-3.5 w-3.5 text-pink-400/50', delay: '2.1s' },
  { className: 'left-[64%] top-0.5 h-2.5 w-2.5 text-indigo-400/60', delay: '0.4s' },
  { className: 'right-[20%] bottom-1.5 h-3 w-3 text-purple-400/50', delay: '1.2s' },
  { className: 'right-4 top-1.5 h-3.5 w-3.5 text-sky-400/60', delay: '2.4s' },
  { className: 'right-[36%] top-1 h-2.5 w-2.5 text-pink-300/50', delay: '0.9s' },
]

/** 底栏两侧按钮统一样式（上一话/下一话、上一页/下一页）。 */
export const readerNavBtn =
  'flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition-all duration-300 hover:bg-white/50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400 dark:disabled:hover:text-slate-200'

/* ─── 加载骨架 ──────────────────────────── */
export function ReaderSkeleton() {
  return (
    <div className="mx-auto w-fit animate-pulse pt-20">
      {[0, 1].map((i) => (
        <div key={i} className="relative aspect-[3/4.2] overflow-hidden bg-slate-300/60 dark:bg-slate-800/60">
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/5" />
        </div>
      ))}
    </div>
  )
}

/* ─── 加载失败提示 ──────────────────────── */
export function ReaderError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-white/40 bg-white/40 px-5 py-2.5 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
      >
        返回上一页
      </button>
    </div>
  )
}

/* ─── 页尾艺术小字 ──────────────────────────────────────── */
/** 一行渐变斜体小字 + 渐隐横线 + 星星点缀；
 * 传入 nextLabel/onNext 时追加一行艺术字跳转链接（如“进入下一页”）。 */
export function EndOfPageLine({
  text,
  nextLabel,
  onNext,
}: {
  text: string
  nextLabel?: string
  onNext?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 py-16">
      <div className="flex items-center justify-center gap-3">
        <span className="h-px w-12 shrink bg-gradient-to-r from-transparent to-indigo-400/60 sm:w-24" />
        <SparkleStar className="h-3 w-3 shrink-0 text-indigo-400/80" delay="0s" />
        <span className="whitespace-nowrap bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text font-serif text-xs italic tracking-[0.35em] text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
          {text}
        </span>
        <SparkleStar className="h-3 w-3 shrink-0 text-pink-400/80" delay="1.3s" />
        <span className="h-px w-12 shrink bg-gradient-to-l from-transparent to-pink-400/60 sm:w-24" />
      </div>
      {nextLabel && onNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          className="group flex flex-col items-center gap-1"
        >
          <span className="flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text font-serif text-sm italic tracking-[0.3em] text-transparent transition-all duration-300 group-hover:brightness-125 dark:from-sky-400 dark:to-indigo-400">
            {nextLabel}
            <ChevronRightIcon className="h-3.5 w-3.5 text-sky-500 transition-transform duration-300 group-hover:translate-x-1 dark:text-sky-400" />
          </span>
          <span className="h-px w-full scale-x-0 bg-gradient-to-r from-sky-400/70 to-indigo-400/70 transition-transform duration-300 group-hover:scale-x-100" />
        </button>
      )}
    </div>
  )
}

/* ─── 顶部工具栏 ────────────────────────────────────────── */
/** 主题切换直接复用全局 ThemeToggle 组件，状态由 App 传入。 */
export function ReaderHeader({
  visible,
  title,
  subtitle,
  info,
  isDark,
  onToggleTheme,
  onBack,
}: {
  visible: boolean
  title: string
  subtitle: string
  info: string
  isDark: boolean
  onToggleTheme: () => void
  onBack: () => void
}) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="border-b border-white/30 bg-white/60 shadow-lg backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            aria-label="返回目录"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all duration-300 hover:bg-white/50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <span className="shrink-0 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
            {info}
          </span>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  )
}

/* ─── 底部导航壳（液态玻璃 + 星星） ─────────────────────── */
export function ReaderNavShell({
  visible,
  panel,
  children,
}: {
  visible: boolean
  panel?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <footer
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-[130%]'
      }`}
    >
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="relative">
          {panel}
          <div className="relative rounded-3xl border border-white/40 bg-white/50 shadow-xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70">
            {NAV_STARS.map((star, i) => (
              <SparkleStar key={i} className={`absolute ${star.className}`} delay={star.delay} />
            ))}
            <div className="relative z-10 px-3 py-2.5">{children}</div>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ─── 页码选择跳转（合并进 x / y 显示，点击弹出选择面板） ─ */
export function PageSelect({
  open,
  onToggle,
  page,
  pageCount,
  totalImages,
  onSelect,
}: {
  open: boolean
  onToggle: () => void
  page: number
  pageCount: number
  totalImages: number
  onSelect: (page: number) => void
}) {
  return (
    <div className="relative shrink-0">
      {/* x / y 显示即选择入口 */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="选择页码"
        className="flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/40 px-3.5 py-2 font-mono text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:text-indigo-400"
      >
        <span className="text-[#5A67FF] dark:text-indigo-400">{page}</span>
        <span className="text-slate-400">/</span>
        <span>{pageCount}</span>
        <ChevronUpIcon
          className={`h-3 w-3 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 向上弹出的页码选择面板 */}
      <div
        className={`absolute bottom-[calc(100%+16px)] left-1/2 w-52 origin-bottom -translate-x-1/2 transition-all duration-300 ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/40 bg-white/70 p-2 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/85">
          {Array.from({ length: pageCount }, (_, i) => {
            const p = i + 1
            const start = i * IMAGES_PER_PAGE + 1
            const end = Math.min(p * IMAGES_PER_PAGE, totalImages)
            const active = p === page
            return (
              <button
                key={p}
                type="button"
                onClick={() => onSelect(p)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-all duration-200 ${
                  active
                    ? 'border border-white/25 bg-[#5A67FF] font-bold text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-600 hover:bg-white/60 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-indigo-400'
                }`}
              >
                <span className={active ? 'text-white' : ''}>
                  第 {p} 页
                </span>
                <span className={`font-mono text-xs ${active ? 'text-white/70' : 'text-slate-400'}`}>
                  {start}-{end}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── 共享 hooks ────────────────────────────────────────── */
/** 顶部常驻阅读进度条（工具栏隐藏时仍保留进度感）。
 * 自己监听滚动自己更新，滚动状态不外泄到页面树。 */
export function ReaderProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-[width] duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

/* ─── 阅读设置面板（背景切换，持久化） ─────────────── */
const BG_OPTIONS: { value: ReaderBg; label: string; swatch: string }[] = [
  { value: 'default', label: '默认', swatch: 'bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-slate-700 dark:to-slate-800' },
  { value: 'black', label: '纯黑', swatch: 'bg-black' },
  { value: 'gray', label: '深灰', swatch: 'bg-neutral-900' },
]

export function ReaderSettingsPanel({
  open,
  onClose,
  bg,
  onBgChange,
}: {
  open: boolean
  onClose: () => void
  bg: ReaderBg
  onBgChange: (bg: ReaderBg) => void
}) {
  if (!open) return null
  return (
    <>
      {/* 透明遮罩点击关闭 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-56 origin-bottom-right animate-[fadeInUp_0.2s_ease-out]">
        <div className="rounded-2xl border border-white/40 bg-white/80 p-4 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/90">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            阅读背景
          </p>
          <div className="flex gap-2">
            {BG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onBgChange(opt.value)}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl p-2 transition-all duration-200 ${
                  bg === opt.value
                    ? 'bg-indigo-500/10 ring-2 ring-indigo-400/60'
                    : 'hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className={`h-8 w-8 rounded-lg border border-slate-200/60 shadow-inner dark:border-white/10 ${opt.swatch}`} />
                <span className={`text-[10px] font-semibold ${
                  bg === opt.value ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
