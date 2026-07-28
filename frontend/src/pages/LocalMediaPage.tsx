import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getLocalMedia, refreshLocalMedia } from '../api/local'

/**
 * 本地资源库入口页（design.md L37-38）：
 * 提供两个入口链接——图片库（堆叠照片）与视频库（卡片），并支持刷新缓存（M2）。
 */

/** 堆叠照片图标（图片库入口）。 */
function PhotosIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21z"
      />
    </svg>
  )
}

/** 视频播放图标（视频库入口）。 */
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  )
}

/** 刷新图标。 */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

interface EntryCardProps {
  to: string
  title: string
  desc: string
  count: number
  countLabel: string
  icon: React.ReactNode
  accent: string
}

/** 毛玻璃入口卡片。 */
function EntryCard({ to, title, desc, count, countLabel, icon, accent }: EntryCardProps) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-8 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-slate-800/50"
    >
      <div className={`mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl ${accent} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{desc}</p>
      <div className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
        <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{count}</span>
        <span>{countLabel}</span>
        <svg
          className="ml-auto h-5 w-5 text-slate-400 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-indigo-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
    </Link>
  )
}

export default function LocalMediaPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['local-media'],
    queryFn: getLocalMedia,
  })

  const refresh = useMutation({
    mutationFn: refreshLocalMedia,
    onSuccess: (fresh) => queryClient.setQueryData(['local-media'], fresh),
  })

  const imageCount = data?.image_albums.length ?? 0
  const videoCount = data?.video_folders.length ?? 0

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-4 pb-16 sm:px-6 lg:px-10">
      {/* 标题栏 */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">本地资源库</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">浏览本机媒体目录中的图片相册与视频合集</p>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/40 px-4 py-2 text-sm font-medium text-slate-600 shadow-md backdrop-blur-md transition-all hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/60"
        >
          <RefreshIcon className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
          {refresh.isPending ? '扫描中…' : '刷新缓存'}
        </button>
      </div>

      {/* 加载失败 */}
      {!isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">加载本地资源失败，请稍后重试或点击「刷新缓存」。</p>
        </div>
      )}

      {/* 加载中骨架 */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-3xl bg-slate-200/60 dark:bg-slate-700/40" />
          ))}
        </div>
      )}

      {/* 两个入口 */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <EntryCard
            to="/local/images"
            title="图片库"
            desc="以堆叠照片墙的形式浏览本地图片相册"
            count={imageCount}
            countLabel="个相册"
            icon={<PhotosIcon className="h-8 w-8" />}
            accent="bg-gradient-to-br from-indigo-500 to-purple-500"
          />
          <EntryCard
            to="/local/videos"
            title="视频库"
            desc="以卡片形式浏览本地视频合集，支持封面预览"
            count={videoCount}
            countLabel="个视频夹"
            icon={<VideoIcon className="h-8 w-8" />}
            accent="bg-gradient-to-br from-sky-500 to-cyan-500"
          />
        </div>
      )}
    </div>
  )
}
