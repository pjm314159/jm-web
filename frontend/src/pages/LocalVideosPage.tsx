import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getLocalMedia, type LocalVideoFolder } from '../api/local'

/**
 * 本地视频库（design.md L40）：
 * 以卡片形式展示本地视频夹（藏书阁式网格），有封面则显示，无则渐变占位 + 播放图标。
 * 本期无详情页，卡片不导航。
 */

/** 返回箭头图标。 */
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}

/** 播放图标（无封面占位 / 角标）。 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/** 视频夹卡片（点击导航到详情页）。 */
function VideoFolderCard({ folder }: { folder: LocalVideoFolder }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/local/videos/${encodeURIComponent(folder.folder_name)}`)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-slate-800/50"
    >
      {/* 封面：有则显示，无则渐变占位 + 播放图标 */}
      <div className="relative aspect-video overflow-hidden bg-slate-200/60 dark:bg-slate-700/50">
        {folder.cover_url ? (
          <img
            src={folder.cover_url}
            alt={folder.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-400/30 to-cyan-400/30 text-white/70">
            <PlayIcon className="h-12 w-12" />
          </div>
        )}
        {/* 视频数角标 */}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          <PlayIcon className="h-3 w-3" />
          {folder.count}
        </span>
      </div>

      {/* 信息区 */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-800 dark:text-slate-100">
          {folder.name}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {folder.count} 个视频
        </span>
      </div>
    </div>
  )
}

export default function LocalVideosPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['local-media'],
    queryFn: getLocalMedia,
  })

  const folders = data?.video_folders ?? []

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
      {/* 标题栏 */}
      <div className="mb-8">
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
            <h1 className="text-3xl font-black tracking-wider text-slate-900 dark:text-white sm:text-4xl">视频库</h1>
            <p className="mt-2 font-medium tracking-wide text-slate-600 dark:text-slate-400">
              本地视频合集，封面一目了然
            </p>
          </div>
          {!isLoading && !isError && (
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              共 <span className="font-bold text-indigo-600 dark:text-indigo-400">{folders.length}</span> 个视频夹
            </div>
          )}
        </div>
      </div>

      {/* 加载中骨架 */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
          ))}
        </div>
      )}

      {/* 加载失败 */}
      {!isLoading && isError && (
        <div className="mt-16 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">加载视频库失败，请稍后重试。</p>
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !isError && folders.length === 0 && (
        <div className="mt-16 text-center">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">暂无视频合集</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            将视频放入媒体目录的 videos 文件夹后，回到本地资源库点击「刷新缓存」。
          </p>
        </div>
      )}

      {/* 视频夹卡片网格 */}
      {!isLoading && !isError && folders.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {folders.map((folder, index) => (
            <div key={folder.folder_name} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
              <VideoFolderCard folder={folder} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
