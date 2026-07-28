import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { searchJm, type SearchType } from '../api/search'
import AlbumCard from '../components/AlbumCard'
import PaginationBar from '../components/PaginationBar'

/**
 * 在线搜索页（design.md L19-L25，基于旧 search.html 重构）：
 * - 搜索栏：类型下拉框（可扩展）+ 输入框 + 毛玻璃 SVG 搜索按钮，聚焦动效
 * - 结果卡片：毛玻璃风格，适配昼夜（复用共享 AlbumCard）
 * - 底部分页栏：整块液态玻璃容器 + 星星闪烁装饰（复用共享 PaginationBar）
 * - 搜索状态（q/type/page）同步到 URL 查询参数，翻页/跳转走客户端路由（无整页刷新），
 *   支持快捷搜索与链接分享。
 * 对接后端 GET /api/search/（S1）。
 */

/** 放大镜图标（功能性 UI 图标）。 */
function SearchIcon({ className = '' }: { className?: string }) {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

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

/** 搜索类型选项（后续可在此扩展更多类型）。 */
const SEARCH_TYPES: { value: SearchType; label: string }[] = [
  { value: 'keyword', label: '关键词' },
  { value: 'tag', label: '标签' },
]

/** 毛玻璃自定义下拉框（替代原生 select，面板可 styling、可扩展选项）。 */
function TypeDropdown({
  value,
  onChange,
}: {
  value: SearchType
  onChange: (type: SearchType) => void
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

  const current = SEARCH_TYPES.find((t) => t.value === value) ?? SEARCH_TYPES[0]

  return (
    <div ref={ref} className="relative shrink-0">
      {/* 触发器：毛玻璃 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-2xl border border-white/40 bg-white/40 py-2.5 pl-3.5 pr-3 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-indigo-300/60 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 ${
          open ? 'border-indigo-300/60 ring-2 ring-indigo-500/30' : ''
        }`}
      >
        {current.label}
        <ChevronDownIcon
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉面板：毛玻璃 + 展开动效 */}
      <div
        className={`absolute left-0 top-full z-30 mt-2 min-w-full origin-top overflow-hidden rounded-2xl border border-white/40 bg-white/70 p-1.5 shadow-2xl backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-slate-800/80 ${
          open ? 'visible scale-100 opacity-100' : 'invisible scale-95 opacity-0'
        }`}
      >
        {SEARCH_TYPES.map((t) => (
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

interface SearchBarProps {
  searchType: SearchType
  inputValue: string
  onTypeChange: (type: SearchType) => void
  onInputChange: (value: string) => void
  onSubmit: () => void
}

function SearchBar({ searchType, inputValue, onTypeChange, onInputChange, onSubmit }: SearchBarProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="group relative z-20 mx-auto flex w-full max-w-2xl items-center gap-2 rounded-3xl border border-white/40 bg-white/50 p-2 shadow-xl backdrop-blur-xl transition-all duration-300 focus-within:scale-[1.01] focus-within:border-indigo-300/60 focus-within:shadow-2xl focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-800/50 dark:focus-within:border-indigo-500/40"
    >
      {/* 搜索类型下拉框（毛玻璃自定义，可扩展）*/}
      <TypeDropdown value={searchType} onChange={onTypeChange} />

      {/* 输入框 */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="搜索您想看的..."
        autoComplete="off"
        spellCheck={false}
        className="flex-1 bg-transparent px-3 py-2.5 text-base font-medium text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
      />

      {/* 搜索按钮：毛玻璃底 + SVG 图标 */}
      <button
        type="submit"
        aria-label="搜索"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/40 text-slate-600 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:text-indigo-400"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
    </form>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // 搜索状态以 URL 查询参数为准（q/type/page）
  const urlQ = searchParams.get('q') ?? ''
  const urlType: SearchType = searchParams.get('type') === 'tag' ? 'tag' : 'keyword'
  const urlPage = Number(searchParams.get('page')) || 1

  // 表单本地状态（输入框/下拉），初始值取自 URL
  const [inputValue, setInputValue] = useState(urlQ)
  const [searchType, setSearchType] = useState<SearchType>(urlType)

  // URL 变化（提交 / 标签点击 / 前进后退）时回填表单
  useEffect(() => {
    setInputValue(urlQ)
    setSearchType(urlType)
  }, [urlQ, urlType])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', urlQ, urlType, urlPage],
    queryFn: () => searchJm(urlQ, urlType, urlPage),
    enabled: !!urlQ,
  })

  const handleSubmit = () => {
    const q = inputValue.trim()
    if (!q) return
    setSearchParams({ q, type: searchType, page: '1' })
  }

  const searchByTag = (tag: string) => {
    setSearchParams({ q: tag, type: 'tag', page: '1' })
  }

  const searchByAuthor = (author: string) => {
    if (!author) return
    setSearchParams({ q: author, type: 'keyword', page: '1' })
  }

  // 翻页仅改 page，replace 避免污染浏览历史
  const goToPage = (page: number) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('page', String(page))
        return p
      },
      { replace: true },
    )
  }

  const results = data?.results ?? []
  const pagination = data?.pagination
  const backendError = data?.error
  const hasSearched = !!urlQ

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
      <SearchBar
        searchType={searchType}
        inputValue={inputValue}
        onTypeChange={setSearchType}
        onInputChange={setInputValue}
        onSubmit={handleSubmit}
      />

      {/* 空闲提示 */}
      {!hasSearched && (
        <div className="mt-20 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            输入关键词或选择标签，开始搜索 JM 站源。
          </p>
        </div>
      )}

      {/* 加载中 */}
      {hasSearched && isLoading && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40"
            />
          ))}
        </div>
      )}

      {/* 请求失败 */}
      {hasSearched && !isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">搜索请求失败，请稍后重试。</p>
        </div>
      )}

      {/* 后端返回错误（如站源网络异常） */}
      {hasSearched && !isLoading && !isError && backendError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-rose-500">{backendError}</p>
        </div>
      )}

      {/* 无结果 */}
      {hasSearched && !isLoading && !isError && !backendError && results.length === 0 && (
        <div className="mt-16 text-center">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">未找到相关内容</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            请尝试更换搜索词或切换搜索类型。
          </p>
        </div>
      )}

      {/* 结果列表 */}
      {hasSearched && !isLoading && !isError && !backendError && results.length > 0 && pagination && (
        <>
          <div className="mt-8 mb-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            找到 <span className="font-bold text-indigo-600 dark:text-indigo-400">{pagination.total}</span> 个结果
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((album) => (
              <AlbumCard
                key={album.jm_id}
                jmId={album.jm_id}
                name={album.name}
                author={album.author}
                tags={album.tags}
                coverUrl={album.cover_url}
                meta={album.update_time}
                downloaded={album.is_downloaded}
                onClick={() => window.open(`/search/album/${album.jm_id}`, '_blank')}
                onTagClick={searchByTag}
                onAuthorClick={searchByAuthor}
              />
            ))}
          </div>
          {pagination.page_count > 1 && (
            <PaginationBar
              pagination={pagination}
              onPrev={() => goToPage(pagination.prev_num)}
              onNext={() => goToPage(pagination.next_num)}
              onJump={goToPage}
            />
          )}
        </>
      )}
    </div>
  )
}
