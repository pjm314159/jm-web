/**
 * 藏书阁高级搜索页：
 * - 名称/作者模糊搜索
 * - 多 tag 交集筛选（AND 语义），tag 面板支持搜索过滤
 * - 液态玻璃风格，与项目整体视觉一致
 * 路由：/library/search
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

import { getLibraryTags, getLibraryAuthors, searchLibraryAlbums, type TagItem, type AuthorItem } from '../api/library'
import AlbumCard from '../components/AlbumCard'
import PaginationBar, { type PaginationInfo } from '../components/PaginationBar'

const PAGE_SIZE = 30

/* ─── 图标 ──────────────────────────────────────────────── */
function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function TagIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  )
}
function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function ChevronLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
function UserIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

/** 示范标签（后端无数据时展示） */
const DEMO_TAGS: TagItem[] = [
  { tag: '全彩', count: 0 }, { tag: '汉化', count: 0 }, { tag: '短篇', count: 0 },
  { tag: '长篇', count: 0 }, { tag: 'CG集', count: 0 }, { tag: '无修正', count: 0 },
  { tag: 'AI绘图', count: 0 }, { tag: '同人', count: 0 },
]

/* ─── 主组件 ────────────────────────────────────────────── */
export default function LibrarySearchPage() {
  const navigate = useNavigate()

  // 搜索状态
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [tagFilter, setTagFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  // 同一时间只展开一个筛选面板
  const [activePanel, setActivePanel] = useState<'tag' | 'author' | null>('tag')
  // 收起动画期间保留上次面板内容，避免内容瞬间消失
  const [displayedPanel, setDisplayedPanel] = useState<'tag' | 'author' | null>('tag')
  const lastPanelRef = useRef<'tag' | 'author'>('tag')
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tagPanelRef = useRef<HTMLDivElement>(null)

  const togglePanel = (panel: 'tag' | 'author') => {
    setActivePanel((prev) => {
      if (prev === panel) {
        // 收起：保留内容供动画展示，动画结束后清除
        clearTimeout(collapseTimerRef.current)
        collapseTimerRef.current = setTimeout(() => setDisplayedPanel(null), 500)
        return null
      }
      // 展开/切换：立即显示新内容
      clearTimeout(collapseTimerRef.current)
      lastPanelRef.current = panel
      setDisplayedPanel(panel)
      return panel
    })
  }

  // 获取 tag：无搜索词时返回 top10，有搜索词时后端搜索全部
  const tagQuery = tagFilter.trim()
  const { data: tagItems = [] } = useQuery({
    queryKey: ['library-tags', tagQuery],
    queryFn: () => getLibraryTags(tagQuery || undefined),
    placeholderData: keepPreviousData,
  })

  // 获取作者：无搜索词时返回 top10，有搜索词时后端搜索全部
  const authorQuery = authorFilter.trim()
  const { data: authorItems = [] } = useQuery({
    queryKey: ['library-authors', authorQuery],
    queryFn: () => getLibraryAuthors(authorQuery || undefined),
    placeholderData: keepPreviousData,
  })

  // 后端无数据时展示示范标签
  const displayTags: TagItem[] = tagItems.length > 0 ? tagItems : (tagQuery ? [] : DEMO_TAGS)

  // 搜索查询（允许空搜索返回全部，keepPreviousData 避免切换时白屏闪烁）
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['library-search', query, selectedTags, selectedAuthors, page],
    queryFn: () => searchLibraryAlbums({ q: query, tags: selectedTags, authors: selectedAuthors, page }),
    placeholderData: keepPreviousData,
  })

  // 延迟显示 loading：响应快时不闪烁
  const [showFetching, setShowFetching] = useState(false)
  useEffect(() => {
    if (!isFetching) { setShowFetching(false); return }
    const timer = setTimeout(() => setShowFetching(true), 300)
    return () => clearTimeout(timer)
  }, [isFetching])

  const albums = data?.results ?? []
  const count = data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const pagination: PaginationInfo | null = data
    ? {
        current: page,
        total: count,
        page_count: pageCount,
        has_prev: page > 1,
        has_next: page < pageCount,
        prev_num: Math.max(1, page - 1),
        next_num: Math.min(pageCount, page + 1),
      }
    : null

  const doSearch = (newPage = 1) => {
    setQuery(inputValue)
    setPage(newPage)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
      return next
    })
    setPage(1)
    setQuery(inputValue)
  }

  const toggleAuthor = (author: string) => {
    setSelectedAuthors((prev) => {
      const next = prev.includes(author) ? prev.filter((a) => a !== author) : [...prev, author]
      return next
    })
    setPage(1)
    setQuery(inputValue)
  }

  const removeTag = (tag: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tag))
    setPage(1)
  }

  const removeAuthor = (author: string) => {
    setSelectedAuthors((prev) => prev.filter((a) => a !== author))
    setPage(1)
  }

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-10">
      {/* 标题栏 */}
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="group inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <span className="rounded-lg border border-white/50 bg-white/40 p-1.5 shadow-sm backdrop-blur-md transition-all group-hover:shadow-md dark:border-white/10 dark:bg-slate-800/50">
            <ChevronLeftIcon className="h-4 w-4" />
          </span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            高级搜索
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">在本地藏书阁中按名称、作者、标签精确筛选</p>
        </div>
      </div>

      {/* 搜索栏（毛玻璃胶囊，与在线搜索一致） */}
      <form
        onSubmit={(e) => { e.preventDefault(); doSearch() }}
        className="group relative z-20 mx-auto mb-6 flex w-full max-w-2xl items-center gap-2 rounded-3xl border border-white/40 bg-white/50 p-2 shadow-xl backdrop-blur-xl transition-all duration-300 focus-within:scale-[1.01] focus-within:border-indigo-300/60 focus-within:shadow-2xl focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-800/50 dark:focus-within:border-indigo-500/40"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="搜索名称或作者…"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent px-4 py-2.5 text-base font-medium text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          type="submit"
          aria-label="搜索"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/40 text-slate-600 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:text-indigo-400"
        >
          <SearchIcon className="h-5 w-5" />
        </button>

      </form>

      {/* 筛选面板（与搜索栏同宽，按钮同行，下拉共享位置） */}
      <div className="mx-auto mb-8 w-full max-w-2xl">
        {/* 已选指示条（丝滑展开，避免布局跳动） */}
        <div
          className="grid transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            gridTemplateRows: (selectedTags.length > 0 || selectedAuthors.length > 0) ? '1fr' : '0fr',
            opacity: (selectedTags.length > 0 || selectedAuthors.length > 0) ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">已选</span>
              {selectedAuthors.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-100/70 px-3 py-1.5 text-xs font-bold text-purple-600 shadow-sm dark:border-white/10 dark:bg-slate-800/50 dark:text-purple-400"
                >
                  <UserIcon className="h-3 w-3" />
                  {a}
                  <button type="button" onClick={() => removeAuthor(a)} className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-slate-200/60 dark:hover:bg-slate-700/60">
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-100/70 px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-sm dark:border-white/10 dark:bg-slate-800/50 dark:text-indigo-400"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-slate-200/60 dark:hover:bg-slate-700/60">
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 筛选按钮行（标签 + 作者同一行） */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => togglePanel('tag')}
            className={`flex items-center gap-2 text-sm font-bold transition-colors ${activePanel === 'tag' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400'}`}
          >
            <TagIcon className="h-4 w-4" />
            标签
            <span className="rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
              {displayTags.length}
            </span>
            <svg
              className={`h-4 w-4 transition-transform duration-300 ${activePanel === 'tag' ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => togglePanel('author')}
            className={`flex items-center gap-2 text-sm font-bold transition-colors ${activePanel === 'author' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-600 hover:text-purple-600 dark:text-slate-300 dark:hover:text-purple-400'}`}
          >
            <UserIcon className="h-4 w-4" />
            作者
            <span className="rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
              {authorItems.length}
            </span>
            <svg
              className={`h-4 w-4 transition-transform duration-300 ${activePanel === 'author' ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* 共享下拉面板区域（丝滑展开动效） */}
        <div
          ref={tagPanelRef}
          className="grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            gridTemplateRows: activePanel ? '1fr' : '0fr',
            opacity: activePanel ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="mt-3 rounded-2xl border border-white/40 bg-white/30 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/30">
              {/* Tag 面板内容 */}
              {displayedPanel === 'tag' && (
                <>
                  <div className="relative mb-3">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={tagFilter}
                      onChange={(e) => setTagFilter(e.target.value)}
                      placeholder="过滤标签…"
                      className="w-full rounded-xl border border-white/50 bg-white/50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder-slate-400 transition-all focus:border-indigo-300/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500"
                    />
                  </div>
                  <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
                    {displayTags.map((item) => {
                      const active = selectedTags.includes(item.tag)
                      return (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => toggleTag(item.tag)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                            active
                              ? 'border-indigo-400/60 bg-slate-100/80 text-indigo-600 shadow-md ring-1 ring-indigo-400/40 dark:bg-slate-700/60 dark:text-indigo-400'
                              : 'border-white/50 bg-slate-100/80 text-slate-600 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:text-indigo-400'
                          }`}
                        >
                          {item.tag}
                        </button>
                      )
                    })}
                    {displayTags.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-400">无匹配标签</p>
                    )}
                  </div>
                </>
              )}
              {/* Author 面板内容 */}
              {displayedPanel === 'author' && (
                <>
                  <div className="relative mb-3">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={authorFilter}
                      onChange={(e) => setAuthorFilter(e.target.value)}
                      placeholder="搜索作者…"
                      className="w-full rounded-xl border border-white/50 bg-white/50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder-slate-400 transition-all focus:border-purple-300/60 focus:outline-none focus:ring-2 focus:ring-purple-500/15 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500"
                    />
                  </div>
                  <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
                    {authorItems.map((item: AuthorItem) => {
                      const active = selectedAuthors.includes(item.author)
                      return (
                        <button
                          key={item.author}
                          type="button"
                          onClick={() => toggleAuthor(item.author)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                            active
                              ? 'border-purple-400/60 bg-slate-100/80 text-purple-600 shadow-md ring-1 ring-purple-400/40 dark:bg-slate-700/60 dark:text-purple-400'
                              : 'border-white/50 bg-slate-100/80 text-slate-600 hover:text-purple-600 dark:border-white/10 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:text-purple-400'
                          }`}
                        >
                          {item.author}
                        </button>
                      )
                    })}
                    {authorItems.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-400">无匹配作者</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 结果区域 */}
      {/* 首次加载骨架屏 */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
          ))}
        </div>
      )}

      {/* 切换筛选条件时的轻量 loading 指示 */}
      {!isLoading && showFetching && (
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-500 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-500 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-500 [animation-delay:300ms]" />
        </div>
      )}

      {!isLoading && albums.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-lg font-bold text-slate-600 dark:text-slate-300">未找到匹配结果</p>
          <p className="mt-2 text-sm text-slate-400">尝试减少标签数量或修改关键词</p>
        </div>
      )}

      {!isLoading && albums.length > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              找到 <span className="font-bold text-indigo-600 dark:text-indigo-400">{count}</span> 本
            </p>
          </div>
          <div className={`grid grid-cols-2 gap-4 transition-opacity duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${showFetching ? 'opacity-60' : 'opacity-100'}`}>
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                jmId={album.jm_id}
                name={album.name}
                author={album.author ?? ''}
                tags={album.tags}
                coverUrl={album.cover_url}
                meta={album.created_at.slice(0, 10)}
                downloaded={false}
                href={`/library/${album.id}`}
                onTagClick={(tag) => {
                  if (!selectedTags.includes(tag)) toggleTag(tag)
                }}
                onAuthorClick={(author) => {
                  if (author) toggleAuthor(author)
                }}
              />
            ))}
          </div>
          {pagination && pagination.page_count > 1 && (
            <PaginationBar
              pagination={pagination}
              onPrev={() => setPage(pagination.prev_num)}
              onNext={() => setPage(pagination.next_num)}
              onJump={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}
