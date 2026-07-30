import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getAlbums } from '../api/library'
import AlbumCard from '../components/AlbumCard'
import PaginationBar, { type PaginationInfo } from '../components/PaginationBar'

/**
 * 藏书阁首页（design.md L26-L27）：
 * - 展示已下载本子，复用搜索页的 AlbumCard，但状态徽章恒显示 JM ID（不显示「已下载」）
 * - 页码同步 URL 参数（?page=），翻页走客户端路由
 * - 点击标签/作者跳转搜索页对应查询
 * 对接后端 GET /api/library/albums/（L1，DRF 分页，PAGE_SIZE=30）。
 */

/** 后端 DRF 分页大小（settings.REST_FRAMEWORK.PAGE_SIZE）。 */
const PAGE_SIZE = 30

/** ISO 时间截取为日期（YYYY-MM-DD）。 */
function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page')) || 1

  const { data, isLoading, isError } = useQuery({
    queryKey: ['library', page],
    queryFn: () => getAlbums(page),
  })

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

  const goToPage = (p: number) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        sp.set('page', String(p))
        return sp
      },
      { replace: true },
    )
  }

  // 点击标签/作者 → 跳转搜索页（搜索页从 URL 参数读取查询）
  const searchByTag = (tag: string) =>
    navigate(`/search?q=${encodeURIComponent(tag)}&type=tag&page=1`)
  const searchByAuthor = (author: string) => {
    if (!author) return
    navigate(`/search?q=${encodeURIComponent(author)}&type=keyword&page=1`)
  }

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
      {/* 标题栏 */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">JM 藏书阁</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">已下载的本子收藏</p>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && !isError && (
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              共 <span className="font-bold text-indigo-600 dark:text-indigo-400">{count}</span> 本
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('/library/search')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/40 px-4 py-2.5 text-sm font-bold text-indigo-600 shadow-md backdrop-blur-md transition-all hover:scale-[1.02] hover:border-indigo-300/60 hover:shadow-lg active:scale-95 dark:border-white/10 dark:bg-slate-800/50 dark:text-indigo-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            高级搜索
          </button>
        </div>
      </div>

      {/* 加载中 */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40"
            />
          ))}
        </div>
      )}

      {/* 请求失败 */}
      {!isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">加载藏书阁失败，请稍后重试。</p>
        </div>
      )}

      {/* 空藏书阁 */}
      {!isLoading && !isError && albums.length === 0 && (
        <div className="mt-16 text-center">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">藏书阁空空如也</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            前往爬虫中心提交下载任务，或在线搜索后下载本子。
          </p>
        </div>
      )}

      {/* 本子列表 */}
      {!isLoading && !isError && albums.length > 0 && pagination && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                jmId={album.jm_id}
                name={album.name}
                author={album.author ?? ''}
                tags={album.tags}
                coverUrl={album.cover_url}
                meta={formatDate(album.created_at)}
                downloaded={false}
                onClick={() => window.open(`/library/${album.id}`, '_blank')}
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
