import { useState } from 'react'

/**
 * 通用分页栏（搜索页 / 藏书阁共用）：整块液态玻璃容器 + 星星闪烁装饰。
 * 三级响应式：
 * - ≥768px：文字（上一页 / 页码 / 跳转 / 下一页）
 * - 640–768px：上一页/下一页变 SVG，页码仍显示
 * - <640px：跳转也变 SVG，隐藏页码，输入框占位符显示当前页
 */

/** 通用分页信息（搜索 S1 与藏书阁 DRF 分页统一为此结构）。 */
export interface PaginationInfo {
  current: number
  total: number
  page_count: number
  has_prev: boolean
  has_next: boolean
  prev_num: number
  next_num: number
}

/** 左箭头图标（上一页，窄屏用）。 */
function ChevronLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

/** 右箭头图标（下一页，窄屏用）。 */
function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/** 双右箭头图标（跳转，窄屏用）。 */
function ChevronsRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  )
}

/** 四角闪烁星（装饰动效）。 */
function SparkleStar({ className = '', delay = '0s' }: { className?: string; delay?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`twinkle-star pointer-events-none absolute ${className}`}
      style={{ animationDelay: delay }}
    >
      <path d="M12 0c.5 6.5 5.5 11.5 12 12-6.5.5-11.5 5.5-12 12-.5-6.5-5.5-11.5-12-12C6.5 11.5 11.5 6.5 12 0z" />
    </svg>
  )
}

/** 星星装饰配置（位置 / 尺寸 / 颜色 / 延迟）。 */
const PAGINATION_STARS: { className: string; delay: string }[] = [
  { className: 'left-3 top-1.5 h-4 w-4 text-indigo-400/70', delay: '0s' },
  { className: 'left-16 bottom-1 h-3 w-3 text-purple-400/60', delay: '0.7s' },
  { className: 'left-32 top-0.5 h-3.5 w-3.5 text-sky-400/60', delay: '1.6s' },
  { className: 'left-[22%] bottom-1.5 h-3 w-3 text-pink-400/50', delay: '2.1s' },
  { className: 'left-[35%] top-1 h-2.5 w-2.5 text-indigo-400/60', delay: '0.4s' },
  { className: 'left-1/2 bottom-0.5 h-4 w-4 text-purple-400/50', delay: '1.2s' },
  { className: 'left-[62%] top-1.5 h-3 w-3 text-sky-400/60', delay: '2.4s' },
  { className: 'left-[72%] bottom-1.5 h-3.5 w-3.5 text-indigo-400/60', delay: '0.9s' },
  { className: 'right-32 top-1 h-3 w-3 text-pink-400/50', delay: '1.8s' },
  { className: 'right-16 bottom-1 h-3 w-3 text-purple-400/60', delay: '0.3s' },
  { className: 'right-4 top-1.5 h-4 w-4 text-indigo-400/70', delay: '1.1s' },
  { className: 'left-9 top-1/2 h-2.5 w-2.5 text-sky-300/60', delay: '2.7s' },
  { className: 'right-11 top-1/2 h-2.5 w-2.5 text-pink-300/50', delay: '1.5s' },
  { className: 'left-1/2 top-0.5 h-2.5 w-2.5 text-indigo-300/60', delay: '0.6s' },
]

export default function PaginationBar({
  pagination,
  onPrev,
  onNext,
  onJump,
}: {
  pagination: PaginationInfo
  onPrev: () => void
  onNext: () => void
  onJump: (page: number) => void
}) {
  const [jumpValue, setJumpValue] = useState('')

  const handleJump = () => {
    const page = parseInt(jumpValue, 10)
    if (Number.isNaN(page)) return
    const clamped = Math.min(Math.max(page, 1), pagination.page_count)
    onJump(clamped)
    setJumpValue('')
  }

  // 容器内部按钮：不再单独卡片化，悬停时浮现浅色底
  const innerBtn =
    'flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-300 hover:bg-white/50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-700 dark:text-slate-200 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400 dark:disabled:hover:text-slate-200'

  return (
    <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/40 bg-white/40 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
      {/* 星星装饰动效 */}
      {PAGINATION_STARS.map((star, i) => (
        <SparkleStar key={i} className={star.className} delay={star.delay} />
      ))}

      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!pagination.has_prev}
          aria-label="上一页"
          className={innerBtn}
        >
          <ChevronLeftIcon className="h-4 w-4 md:hidden" />
          <span className="hidden md:inline">上一页</span>
        </button>

        <div className="hidden px-3 py-2 font-mono text-sm font-bold text-slate-700 dark:text-slate-200 sm:block">
          <span className="text-indigo-600 dark:text-indigo-400">{pagination.current}</span>
          <span className="mx-1 text-slate-400">/</span>
          <span>{pagination.page_count}</span>
        </div>

        {/* 页码跳转（隐藏原生上下箭头）*/}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={pagination.page_count}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            placeholder={String(pagination.current)}
            className="no-spinner w-16 rounded-xl border border-white/40 bg-white/30 px-2 py-1.5 text-center text-sm font-medium text-slate-700 outline-none transition-all focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={handleJump}
            aria-label="跳转"
            className="flex items-center justify-center rounded-xl border border-white/40 bg-white/40 px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:text-indigo-400"
          >
            <ChevronsRightIcon className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">跳转</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!pagination.has_next}
          aria-label="下一页"
          className={innerBtn}
        >
          <span className="hidden md:inline">下一页</span>
          <ChevronRightIcon className="h-4 w-4 md:hidden" />
        </button>
      </div>
    </div>
  )
}
