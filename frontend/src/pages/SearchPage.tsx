import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  searchJm,
  type SearchCategory,
  type SearchOrderBy,
  type SearchSubCategory,
  type SearchTime,
  type SearchType,
} from '../api/search'
import AlbumCard from '../components/AlbumCard'
import PaginationBar from '../components/PaginationBar'
import { FilterDropdown } from '../components/SearchFilters'
import {
  CATEGORY_OPTIONS,
  CATEGORY_VALUES,
  isIn,
  ORDER_BY_OPTIONS,
  ORDER_BY_VALUES,
  SUB_CATEGORY_OPTIONS_BY_CATEGORY,
  SUB_CATEGORY_VALUES,
  TIME_OPTIONS,
  TIME_VALUES,
  type DropdownOption,
} from '../lib/searchFilters'

/**
 * 在线搜索页（design.md L19-L25，基于旧 search.html 重构）：
 * - 搜索栏：类型下拉框（可扩展）+ 输入框 + 毛玻璃 SVG 搜索按钮，聚焦动效
 * - 结果卡片：毛玻璃风格，适配昼夜（复用共享 AlbumCard）
 * - 底部分页栏：整块液态玻璃容器 + 星星闪烁装饰（复用共享 PaginationBar）
 * - 搜索状态（q/type/page/order_by/time/category/sub_category）同步到 URL 查询参数，
 *   翻页/跳转走客户端路由（无整页刷新），
 *   支持快捷搜索与链接分享。
 * - 支持空搜索：关键词留空时仅按筛选条件浏览全部作品。
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

/** 搜索类型选项（后续可在此扩展更多类型）。 */
const SEARCH_TYPES: DropdownOption<SearchType>[] = [
  { value: 'keyword', label: '关键词' },
  { value: 'tag', label: '标签' },
  { value: 'author', label: '作者' },
]

const SEARCH_PARAM_KEYS = ['q', 'type', 'page', 'order_by', 'time', 'category', 'sub_category'] as const

interface SearchBarProps {
  searchType: SearchType
  inputValue: string
  orderBy: SearchOrderBy
  time: SearchTime
  category: SearchCategory
  subCategory: SearchSubCategory | ''
  subCategoryOptions: DropdownOption<SearchSubCategory | ''>[]
  onTypeChange: (type: SearchType) => void
  onInputChange: (value: string) => void
  onOrderByChange: (value: SearchOrderBy) => void
  onTimeChange: (value: SearchTime) => void
  onCategoryChange: (value: SearchCategory) => void
  onSubCategoryChange: (value: SearchSubCategory | '') => void
  onSubmit: () => void
}

function SearchBar({
  searchType,
  inputValue,
  orderBy,
  time,
  category,
  subCategory,
  subCategoryOptions,
  onTypeChange,
  onInputChange,
  onOrderByChange,
  onTimeChange,
  onCategoryChange,
  onSubCategoryChange,
  onSubmit,
}: SearchBarProps) {
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="group relative z-20 mx-auto flex w-full max-w-2xl items-center gap-2 rounded-3xl border border-white/40 bg-white/50 p-2 shadow-xl backdrop-blur-xl transition-all duration-300 focus-within:scale-[1.01] focus-within:border-indigo-300/60 focus-within:shadow-2xl focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-800/50 dark:focus-within:border-indigo-500/40"
      >
        {/* 搜索类型下拉框（毛玻璃自定义，可扩展）*/}
        <FilterDropdown value={searchType} options={SEARCH_TYPES} onChange={onTypeChange} />

        {/* 输入框（min-w-0：允许 flex 压缩，小屏不会把搜索按钮挤出屏幕） */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="搜索您想看的..."
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base font-medium text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100 dark:placeholder-slate-500"
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

      {/* 筛选行：排序 / 时间 / 分类 / 子分类（复用同一个毛玻璃下拉组件） */}
      <div className="mx-auto mt-3 flex w-full max-w-2xl flex-wrap items-center justify-center gap-2">
        <FilterDropdown label="排序" value={orderBy} options={ORDER_BY_OPTIONS} onChange={onOrderByChange} />
        <FilterDropdown label="时间" value={time} options={TIME_OPTIONS} onChange={onTimeChange} />
        <FilterDropdown label="分类" value={category} options={CATEGORY_OPTIONS} onChange={onCategoryChange} />
        {subCategoryOptions.length > 0 && (
          <FilterDropdown
            label="子分类"
            value={subCategory}
            options={subCategoryOptions}
            onChange={onSubCategoryChange}
          />
        )}
      </div>
    </>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // 搜索状态以 URL 查询参数为准（q/type/page/order_by/time/category/sub_category）
  const urlQ = searchParams.get('q') ?? ''
  const urlType: SearchType =
    searchParams.get('type') === 'tag'
      ? 'tag'
      : searchParams.get('type') === 'author'
        ? 'author'
        : 'keyword'
  const urlPage = Number(searchParams.get('page')) || 1
  const rawOrderBy = searchParams.get('order_by')
  const rawTime = searchParams.get('time')
  const rawCategory = searchParams.get('category')
  const rawSubCategory = searchParams.get('sub_category')
  const urlOrderBy: SearchOrderBy = isIn(rawOrderBy, ORDER_BY_VALUES) ? rawOrderBy : 'mr'
  const urlTime: SearchTime = isIn(rawTime, TIME_VALUES) ? rawTime : 'a'
  const urlCategory: SearchCategory = isIn(rawCategory, CATEGORY_VALUES) ? rawCategory : '0'
  const urlSubCategory: SearchSubCategory | '' = isIn(rawSubCategory, SUB_CATEGORY_VALUES)
    ? rawSubCategory
    : ''

  // 表单本地状态（输入框/下拉），初始值取自 URL
  const [inputValue, setInputValue] = useState(urlQ)
  const [searchType, setSearchType] = useState<SearchType>(urlType)
  const [orderBy, setOrderBy] = useState<SearchOrderBy>(urlOrderBy)
  const [time, setTime] = useState<SearchTime>(urlTime)
  const [category, setCategory] = useState<SearchCategory>(urlCategory)
  const [subCategory, setSubCategory] = useState<SearchSubCategory | ''>(urlSubCategory)

  // 当前分类下的副分类选项（无副分类时为空数组，前端隐藏该下拉）
  const subCategoryOptions = SUB_CATEGORY_OPTIONS_BY_CATEGORY[category]

  // URL 变化（提交 / 标签点击 / 前进后退）时回填表单
  useEffect(() => {
    setInputValue(urlQ)
    setSearchType(urlType)
    setOrderBy(urlOrderBy)
    setTime(urlTime)
    setCategory(urlCategory)
    setSubCategory(urlSubCategory)
  }, [urlQ, urlType, urlOrderBy, urlTime, urlCategory, urlSubCategory])

  // URL 上带有任一搜索参数（含仅筛选/翻页）即视为已发起搜索
  const hasSearched = SEARCH_PARAM_KEYS.some((key) => searchParams.has(key))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', urlQ, urlType, urlPage, urlOrderBy, urlTime, urlCategory, urlSubCategory],
    queryFn: () =>
      searchJm(urlQ, urlType, urlPage, {
        order_by: urlOrderBy,
        time: urlTime,
        category: urlCategory,
        sub_category: urlSubCategory || undefined,
      }),
    enabled: hasSearched,
  })

  const handleSubmit = () => {
    const q = inputValue.trim()
    const params: Record<string, string> = { q, type: searchType, page: '1' }
    if (orderBy !== 'mr') params.order_by = orderBy
    if (time !== 'a') params.time = time
    if (category !== '0') params.category = category
    if (subCategoryOptions.length > 0 && subCategory) params.sub_category = subCategory
    setSearchParams(params)
  }

  const searchByTag = (tag: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('q', tag)
      p.set('type', 'tag')
      p.set('page', '1')
      return p
    })
  }

  const searchByAuthor = (author: string) => {
    if (!author) return
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('q', author)
      p.set('type', 'keyword')
      p.set('page', '1')
      return p
    })
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

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
      <SearchBar
        searchType={searchType}
        inputValue={inputValue}
        orderBy={orderBy}
        time={time}
        category={category}
        subCategory={subCategory}
        subCategoryOptions={subCategoryOptions}
        onTypeChange={setSearchType}
        onInputChange={setInputValue}
        onOrderByChange={setOrderBy}
        onTimeChange={setTime}
        onCategoryChange={(value) => {
          setCategory(value)
          setSubCategory('')
        }}
        onSubCategoryChange={setSubCategory}
        onSubmit={handleSubmit}
      />

      {/* 空闲提示 */}
      {!hasSearched && (
        <div className="mt-20 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            输入关键词开始搜索，或直接点击搜索浏览全部作品。
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
                href={`/search/album/${album.jm_id}`}
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
