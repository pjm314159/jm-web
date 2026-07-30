import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getLocalVideos } from '../api/local'
import { setPageTitle } from '../lib/usePageTitle'
import VideoPlayer from '../components/VideoPlayer'

/**
 * 本地视频详情页（design.md L40）：
 * 路由 /local/videos/:folderName，调用 M4 获取视频列表，使用 VideoPlayer 组件播放。
 */

/** 返回箭头图标。 */
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}

export default function LocalVideosDetailPage() {
  const { folderName } = useParams<{ folderName: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['local-videos', folderName],
    queryFn: () => getLocalVideos(folderName!),
    enabled: !!folderName,
  })

  useEffect(() => {
    if (folderName) setPageTitle(decodeURIComponent(folderName))
  }, [folderName])

  const episodes = (data?.files ?? []).map((f) => ({ name: f.name, src: f.url }))

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-20">
      {/* 返回 + 标题 */}
      <Link
        to="/local/videos"
        className="group mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <span className="rounded-lg border border-white/50 bg-white/40 p-1.5 shadow-sm backdrop-blur-md transition-all group-hover:shadow-md dark:border-white/10 dark:bg-slate-800/50">
          <BackIcon className="h-4 w-4" />
        </span>
        返回视频库
      </Link>
      <h1 className="mb-6 text-2xl font-black tracking-wide text-slate-900 dark:text-white">
        {folderName}
        {data && (
          <span className="ml-3 text-sm font-medium text-slate-400">{data.count} 个视频</span>
        )}
      </h1>

      {/* 加载中 */}
      {isLoading && (
        <div className="aspect-video animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
      )}

      {/* 加载失败 */}
      {!isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">加载视频列表失败，请稍后重试。</p>
        </div>
      )}

      {/* 空文件夹 */}
      {!isLoading && !isError && episodes.length === 0 && (
        <div className="mt-16 text-center">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">该文件夹暂无视频</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            请将视频文件放入对应文件夹后刷新缓存。
          </p>
        </div>
      )}

      {/* 播放器 */}
      {!isLoading && !isError && episodes.length > 0 && (
        <VideoPlayer episodes={episodes} />
      )}
    </div>
  )
}
