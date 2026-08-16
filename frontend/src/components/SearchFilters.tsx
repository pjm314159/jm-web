/**
 * 搜索/排行榜共用的筛选下拉组件（毛玻璃风格）。
 * 选项常量与工具函数见 ../lib/searchFilters。
 */
import { useEffect, useRef, useState } from 'react'

import type { DropdownOption } from '../lib/searchFilters'

/** 下拉箭头图标。 */
function ChevronDownIcon({ className = '' }: { className?: string }) {
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
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/** 勾选图标（下拉选中项）。 */
function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/** 毛玻璃自定义下拉框（替代原生 select，面板可 styling、可扩展选项）。 */
export function FilterDropdown<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [])

  const current = options.find((t) => t.value === value) ?? options[0]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-2xl border border-white/40 bg-white/40 py-2.5 pl-3.5 pr-3 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-indigo-300/60 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 ${
          open ? 'border-indigo-300/60 ring-2 ring-indigo-500/30' : ''
        }`}
      >
        {label ? `${label}：` : ''}
        {current.label}
        <ChevronDownIcon
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`absolute left-0 top-full z-30 mt-2 min-w-full origin-top overflow-hidden rounded-2xl border border-white/40 bg-white/70 p-1.5 shadow-2xl backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-slate-800/80 ${
          open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'
        }`}
      >
        {options.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              onChange(t.value)
              setOpen(false)
            }}
            className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
              t.value === value
                ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60'
            }`}
          >
            {t.label}
            {t.value === value && <CheckIcon className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </div>
  )
}
