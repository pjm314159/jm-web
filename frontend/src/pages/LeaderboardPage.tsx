import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  searchJm,
  type SearchCategory,
  type SearchOrderBy,
  type SearchTime,
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
  TIME_OPTIONS,
  TIME_VALUES,
} from '../lib/searchFilters'
import { setPageTitle } from '../lib/usePageTitle'

/**
 * 排行榜页：样式与搜索页一致，顶部只有筛选框（排序/时间/分类），无搜索框。
 * 数据走 S1 搜索接口的 rank 类型（底层 jmcomic categories_filter）。
 */
export default function LeaderboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    setPageTitle('排行榜')
  }, [])

  const urlPage = Math.max(1, Number(searchParams.get('page')) || 1)
  const rawOrderBy = searchParams.get('order_by')
  const rawTime = searchParams.get('time')
  const rawCategory = searchParams.get('category')
  const orderBy: SearchOrderBy = isIn(rawOrderBy, ORDER_BY_VALUES) ? rawOrderBy : 'mv_m'
  const time: SearchTime = isIn(rawTime, TIME_VALUES) ? rawTime : 'a'
  const category: SearchCategory = isIn(rawCategory, CATEGORY_VALUES) ? rawCategory : '0'

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', urlPage, orderBy, time, category],
    queryFn: () =>
      searchJm('', 'rank', urlPage, {
        order_by: orderBy,
        time,
        category,
      }),
  })

  /** 筛选变化：立即生效并回到第 1 页（替换历史，避免刷历史记录）。 */
  const updateFilter = (patch: Record<string, string>) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        Object.entries(patch).forEach(([key, value]) => {
          if (value) p.set(key, value)
          else p.delete(key)
        })
        p.set('page', '1')
        return p
      },
      { replace: true },
    )
  }

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

  const searchByTag = (tag: string) =>
    navigate(`/search?q=${encodeURIComponent(tag)}&type=tag&page=1`)
  const searchByAuthor = (author: string) =>
    navigate(`/search?q=${encodeURIComponent(author)}&type=keyword&page=1`)

  const results = data?.results ?? []
  const pagination = data?.pagination
  const backendError = data?.error

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-wide text-slate-900 dark:text-white">
          排行榜
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          按排行、时间、分类等多条件浏览站源作品
        </p>
      </div>

      {/* 筛选行：无搜索框 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <FilterDropdown
          label="排序"
          value={orderBy}
          options={ORDER_BY_OPTIONS}
          onChange={(v) => updateFilter({ order_by: v })}
        />
        <FilterDropdown
          label="时间"
          value={time}
          options={TIME_OPTIONS}
          onChange={(v) => updateFilter({ time: v })}
        />
        <FilterDropdown
          label="分类"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(v) => updateFilter({ category: v })}
        />
      </div>

      {isLoading && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40"
            />
          ))}
        </div>
      )}

      {backendError && (
        <p className="mt-10 text-center text-sm text-rose-500">{backendError}</p>
      )}

      {data && (
        <>
          <div className="mt-8 mb-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            共{' '}
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {pagination?.total ?? 0}
            </span>{' '}
            个作品
          </div>

          {results.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              暂无作品
            </p>
          ) : (
            <>
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
              {pagination && pagination.page_count > 1 && (
                <PaginationBar
                  pagination={pagination}
                  onPrev={() => goToPage(pagination.prev_num)}
                  onNext={() => goToPage(pagination.next_num)}
                  onJump={goToPage}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
