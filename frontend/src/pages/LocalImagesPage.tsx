import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getLocalMedia } from '../api/local'
import StackedAlbumCard from '../components/StackedAlbumCard'
import PaginationBar, { type PaginationInfo } from '../components/PaginationBar'

/**
 * 本地图片库（design.md L39）：
 * 以堆叠照片墙形式展示本地图片相册，复用 ['local-media'] 查询缓存。
 * 点击相册卡片进入本地阅读页 /local/reader/:folderName。
 */

/** 返回箭头图标。 */
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}

const PER_PAGE = 12

export default function LocalImagesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['local-media'],
    queryFn: getLocalMedia,
  })

  const albums = data?.image_albums ?? []
  const pageCount = Math.max(1, Math.ceil(albums.length / PER_PAGE))
  const safePage = Math.min(page, pageCount)
  const paged = albums.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  const pagination: PaginationInfo = {
    current: safePage,
    total: albums.length,
    page_count: pageCount,
    has_prev: safePage > 1,
    has_next: safePage < pageCount,
    prev_num: safePage - 1,
    next_num: safePage + 1,
  }

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-10">
      {/* 标题栏 */}
      <div className="mb-12">
        <Link
          to="/local"
          className="group mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <span className="rounded-lg border border-white/50 bg-white/40 p-1.5 shadow-sm backdrop-blur-md transition-all group-hover:shadow-md dark:border-white/10 dark:bg-slate-800/50">
            <BackIcon className="h-4 w-4" />
          </span>
          返回本地资源库
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-wider text-slate-900 dark:text-white sm:text-4xl">图片库</h1>
          </div>
          {!isLoading && !isError && (
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              共 <span className="font-bold text-indigo-600 dark:text-indigo-400">{albums.length}</span> 个相册
            </div>
          )}
        </div>
      </div>

      {/* 加载中骨架 */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-20 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="aspect-[4/3] w-[85%] animate-pulse rounded-lg bg-slate-200/60 dark:bg-slate-700/40" />
              <div className="mt-6 h-5 w-1/2 animate-pulse rounded bg-slate-200/60 dark:bg-slate-700/40" />
            </div>
          ))}
        </div>
      )}

      {/* 加载失败 */}
      {!isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">加载图片库失败，请稍后重试。</p>
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !isError && albums.length === 0 && (
        <div className="mt-16 text-center">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">暂无图片相册</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            将图片放入媒体目录的 images/local 文件夹后，回到本地资源库点击「刷新缓存」。
          </p>
        </div>
      )}

      {/* 堆叠照片墙 */}
      {!isLoading && !isError && albums.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-20 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((album, index) => (
              <div key={album.folder_name} className="animate-fade-in-up" style={{ animationDelay: `${index * 60}ms` }}>
                <StackedAlbumCard
                  name={album.name}
                  count={album.count}
                  previewUrls={album.preview_urls}
                  onClick={() => navigate(`/local/reader/${encodeURIComponent(album.folder_name)}`)}
                />
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <PaginationBar
              pagination={pagination}
              onPrev={() => setPage(safePage - 1)}
              onNext={() => setPage(safePage + 1)}
              onJump={(p) => setPage(p)}
            />
          )}
        </>
      )}
    </div>
  )
}
