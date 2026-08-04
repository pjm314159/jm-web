/**
 * 搜索二级详情页（design.md L42-46, L55）：
 * - 液态玻璃风格，列表行章节展示
 * - 处理空状态：简介/标签/章节名/封面 均可为空
 * - 功能：添加下载任务、章节分页
 * 路由：/search/album/:jmId
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { getCrawlTaskStatus, submitCrawl } from '../api/crawl'
import { getSearchAlbumDetail } from '../api/search'
import CommentSection from '../components/CommentSection'
import { setPageTitle } from '../lib/usePageTitle'

/* ─── 图标 ──────────────────────────────────────────────── */
function HeartIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  )
}
function EyeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function ChatIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
    </svg>
  )
}
function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}
function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
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
function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/* ─── 章节分页 ──────────────────────────────────────────── */
const EP_PER_PAGE = 20

/* ─── 加载骨架 ──────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="mx-auto mt-24 w-full max-w-5xl animate-pulse px-4 pb-24 sm:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-slate-200/70 dark:bg-slate-700/50">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/5" />
          </div>
          <div className="h-12 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="h-9 w-3/4 rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-xl bg-slate-200/60 dark:bg-slate-700/40" />
            ))}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-16 rounded-full bg-slate-200/60 dark:bg-slate-700/40" />
            ))}
          </div>
          <div className="h-20 rounded-2xl bg-slate-200/50 dark:bg-slate-700/30" />
          <div className="mt-4 h-7 w-40 rounded-lg bg-slate-200/70 dark:bg-slate-700/50" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 rounded-xl bg-slate-200/50 dark:bg-slate-700/30" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── 主组件 ────────────────────────────────────────────── */
export default function SearchDetailPage() {
  const { jmId } = useParams<{ jmId: string }>()
  const navigate = useNavigate()
  const [epPage, setEpPage] = useState(1)
  const queryClient = useQueryClient()
  const [dlState, setDlState] = useState<'idle' | 'loading' | 'downloading' | 'success' | 'error'>('idle')
  const [dlMsg, setDlMsg] = useState('')
  const [dlProgress, setDlProgress] = useState<{ done: number; total: number } | null>(null)
  const [localAlbumId, setLocalAlbumId] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 清理轮询
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startPolling = (taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const st = await getCrawlTaskStatus(taskId)
        if (st.state === 'SUCCESS' || st.state === 'PARTIAL') {
          if (pollRef.current) clearInterval(pollRef.current)
          setDlState('success')
          setDlMsg('')
          if (st.album_id) setLocalAlbumId(st.album_id)
          queryClient.invalidateQueries({ queryKey: ['search-detail', jmId] })
        } else if (st.state === 'FAILED') {
          if (pollRef.current) clearInterval(pollRef.current)
          setDlState('error')
          setDlMsg('下载失败')
        } else if (st.progress) {
          setDlState('downloading')
          setDlProgress({ done: st.progress.images_done, total: st.progress.images_total })
          setDlMsg('')
        }
      } catch {
        // 轮询失败静默忽略
      }
    }, 2000)
  }

  const handleDownload = async () => {
    if (!jmId || dlState === 'loading' || dlState === 'downloading') return
    setDlState('loading')
    setDlMsg('')
    setDlProgress(null)
    try {
      const res = await submitCrawl(jmId)
      setDlState('downloading')
      setDlMsg(res.message || '任务已提交，正在下载…')
      startPolling(res.task_id)
    } catch (err) {
      setDlState('error')
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        '提交失败，请稍后重试'
      setDlMsg(msg)
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search-detail', jmId],
    queryFn: () => getSearchAlbumDetail(jmId!),
    enabled: !!jmId,
  })

  useEffect(() => {
    if (data?.album?.name) setPageTitle(data.album.name)
  }, [data?.album?.name])

  if (isLoading) return <LoadingSkeleton />

  if (isError || !data) {
    return (
      <div className="relative z-10 mx-auto mt-32 w-full max-w-5xl px-4 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">加载失败，可能是网络问题或该本子不存在。</p>
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="mt-4 rounded-xl border border-white/40 bg-white/40 px-5 py-2.5 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
        >
          返回搜索
        </button>
      </div>
    )
  }

  const { album, is_downloaded, local_album_id } = data
  // 下载完成后立即切换为已下载态（无需等待 refetch）
  const effectiveDownloaded = is_downloaded || dlState === 'success'
  const effectiveLocalId = local_album_id ?? localAlbumId
  const episodes = album.episode_list ?? []
  const epPageCount = Math.max(1, Math.ceil(episodes.length / EP_PER_PAGE))
  const safePage = Math.min(epPage, epPageCount)
  const pagedEps = episodes.slice((safePage - 1) * EP_PER_PAGE, safePage * EP_PER_PAGE)

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-4 pb-24 sm:px-6 lg:px-10">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="group mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <span className="rounded-lg border border-white/50 bg-white/40 p-1.5 shadow-sm backdrop-blur-md transition-all group-hover:shadow-md dark:border-white/10 dark:bg-slate-800/50">
          <ChevronLeftIcon className="h-4 w-4" />
        </span>
        返回搜索
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        {/* ─── 左侧：封面 + 操作 ─── */}
        <aside className="flex flex-col gap-5">
          {/* 封面 */}
          <div className="group relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-3 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-800/50">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-200/60 dark:bg-slate-700/50">
              {album.cover_url ? (
                <img
                  src={album.cover_url}
                  alt={album.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-pink-500/20">
                  <BookIcon className="h-16 w-16 text-indigo-400/60" />
                  <span className="px-4 text-center text-sm font-bold text-indigo-400/70 dark:text-indigo-400/50">
                    暂无封面
                  </span>
                </div>
              )}
            </div>
            <span className="absolute left-5 top-5 rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              JM-{album.jm_id}
            </span>
          </div>

          {/* 下载按钮（未下载时显示，下载完成后丝滑淡出） */}
          <div
            className={`transition-all duration-500 ease-out ${
              effectiveDownloaded
                ? 'pointer-events-none max-h-0 scale-95 opacity-0'
                : 'max-h-20 scale-100 opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={handleDownload}
              disabled={dlState === 'loading' || dlState === 'downloading'}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/40 bg-white/50 px-6 py-3.5 text-sm font-bold text-indigo-600 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-indigo-300/60 hover:shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-90 dark:border-white/10 dark:bg-slate-800/60 dark:text-indigo-400"
            >
              {/* 下载中：按钮内部进度条填充 */}
              {dlState === 'downloading' && dlProgress && dlProgress.total > 0 && (
                <span
                  className="absolute inset-y-0 left-0 bg-indigo-500/20 transition-[width] duration-700 ease-out dark:bg-indigo-400/20"
                  style={{ width: `${Math.min(100, (dlProgress.done / dlProgress.total) * 100)}%` }}
                />
              )}
              <DownloadIcon className={`relative h-5 w-5 ${dlState === 'downloading' ? 'animate-bounce' : ''}`} />
              <span className="relative">
                {dlState === 'loading'
                  ? '提交中…'
                  : dlState === 'downloading'
                    ? dlProgress
                      ? `下载中 ${dlProgress.done}/${dlProgress.total}`
                      : '下载中…'
                    : '添加下载任务'}
              </span>
            </button>
          </div>

          {/* 更新提示（已下载且有新章节） */}
          {effectiveDownloaded && data.has_updates && (
            <div className="animate-update-pop-in inline-flex items-center gap-2.5 rounded-full border border-white/40 bg-white/40 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
              <span className="relative flex items-center gap-2">
                <span className="animate-update-pulse-dot h-2 w-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {data.new_episode_count} 个新章节
                </span>
              </span>
              <button
                type="button"
                onClick={handleDownload}
                disabled={dlState === 'loading' || dlState === 'downloading'}
                className="glass-btn glass-btn-sm !py-1 !px-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="glass-btn-overlay" />
                <span className="glass-btn-text !text-[11px]">
                  {dlState === 'loading'
                    ? '提交中…'
                    : dlState === 'downloading'
                      ? dlProgress
                        ? `${dlProgress.done}/${dlProgress.total}`
                        : '下载中…'
                      : '立即更新'}
                </span>
              </button>
            </div>
          )}

          {/* 提交反馈（仅错误时显示） */}
          {dlMsg && dlState === 'error' && (
            <p className="text-center text-xs font-medium text-rose-500">{dlMsg}</p>
          )}

          {/* 本地详情快捷跳转（下载完成后丝滑淡入，与检测到本地下载样式一致） */}
          <div
            className={`transition-all duration-500 ease-out ${
              effectiveDownloaded && effectiveLocalId
                ? 'max-h-20 scale-100 opacity-100'
                : 'pointer-events-none max-h-0 scale-95 opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={() => navigate(`/library/${effectiveLocalId}`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200/50 bg-emerald-50/40 px-6 py-3 text-sm font-semibold text-emerald-600 shadow-md backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-emerald-300/60 hover:shadow-lg active:scale-95 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400"
            >
              <BookIcon className="h-4 w-4" />
              查看本地详情
            </button>
          </div>
        </aside>

        {/* ─── 右侧：详情 + 章节 ─── */}
        <main className="flex min-w-0 flex-col gap-6">
          {/* 标题 */}
          <h1 className="text-2xl font-black leading-tight tracking-wide text-slate-900 dark:text-white sm:text-3xl">
            {album.name}
          </h1>

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-3">
            {album.author && album.author !== '未知' && (
              <MetaChip label="作者" value={album.author} iconBg="bg-indigo-500/10 dark:bg-indigo-400/10" iconColor="text-indigo-500 dark:text-indigo-400" icon={<BookIcon className="h-4 w-4" />} onClick={() => navigate(`/search?q=${encodeURIComponent(album.author)}&type=keyword&page=1`)} />
            )}
            <MetaChip label="点赞" value={formatNum(album.likes)} iconBg="bg-rose-500/10 dark:bg-rose-400/10" iconColor="text-rose-500 dark:text-rose-400" icon={<HeartIcon className="h-4 w-4" />} />
            <MetaChip label="观看" value={formatNum(album.views)} iconBg="bg-sky-500/10 dark:bg-sky-400/10" iconColor="text-sky-500 dark:text-sky-400" icon={<EyeIcon className="h-4 w-4" />} />
            <MetaChip label="评论" value={formatNum(album.comments_count)} iconBg="bg-amber-500/10 dark:bg-amber-400/10" iconColor="text-amber-500 dark:text-amber-400" icon={<ChatIcon className="h-4 w-4" />} />
          </div>

          {/* 标签（可能为空，点击跳转搜索） */}
          {album.tags && album.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {album.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}&type=tag&page=1`)}
                  className="cursor-pointer rounded-full border border-white/40 bg-white/40 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur-sm transition-all hover:border-indigo-300/60 hover:bg-indigo-50/50 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* 简介（可能为空） */}
          {album.description && album.description !== '暂无简介' ? (
            <div className="rounded-2xl border border-white/40 bg-white/30 p-5 text-sm leading-relaxed text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300">
              {album.description}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200/60 bg-slate-50/30 p-5 text-sm text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/20 dark:text-slate-500">
              暂无简介
            </div>
          )}

          {/* ─── 章节目录 ─── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <BookIcon className="h-5 w-5 text-indigo-500" />
                章节目录
                <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {episodes.length} 话
                </span>
              </h2>
              {epPageCount > 1 && (
                <span className="text-xs font-medium text-slate-400">
                  {safePage} / {epPageCount}
                </span>
              )}
            </div>

            {episodes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/60 bg-slate-50/30 p-8 text-center text-sm text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/20 dark:text-slate-500">
                暂无章节信息
              </div>
            ) : (
              <>
                {/* 章节列表行 */}
                <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/30 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40">
                  {pagedEps.map((ep, i) => (
                    <button
                      key={ep.photo_id}
                      type="button"
                      onClick={() => navigate(`/search/reader/${ep.photo_id}`)}
                      className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition-colors hover:bg-indigo-500/10 dark:hover:bg-indigo-500/15 ${
                        i !== pagedEps.length - 1 ? 'border-b border-slate-200/50 dark:border-slate-700/40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/80 text-xs font-bold text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
                          {ep.index}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {ep.name || `第${ep.index}话`}
                        </span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                    </button>
                  ))}
                </div>

                {/* 分页 */}
                {epPageCount > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEpPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="flex items-center gap-1 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:border-indigo-300/60 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">上一页</span>
                    </button>
                    <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
                      <span className="text-indigo-600 dark:text-indigo-400">{safePage}</span>
                      <span className="mx-1 text-slate-400">/</span>
                      {epPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEpPage((p) => Math.min(epPageCount, p + 1))}
                      disabled={safePage >= epPageCount}
                      className="flex items-center gap-1 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:border-indigo-300/60 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      <span className="hidden sm:inline">下一页</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </div>

      {/* ─── 评论区（底部滚动加载） ─── */}
      <CommentSection jmId={album.jm_id} />
    </div>
  )
}

/* ─── 辅助 ──────────────────────────────────────────────── */
function MetaChip({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  onClick,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  iconBg?: string
  iconColor?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl border border-white/40 bg-white/30 px-4 py-2.5 backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:shadow-md dark:border-white/10 dark:bg-slate-800/40 dark:hover:border-white/20 ${onClick ? 'cursor-pointer active:scale-95 hover:border-indigo-300/60 dark:hover:border-indigo-500/40' : ''}`}
    >
      {icon && (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconBg ?? 'bg-slate-500/10'} ${iconColor ?? 'text-slate-500'}`}>
          {icon}
        </span>
      )}
      <div className="min-w-0 text-left">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
        <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{value}</div>
      </div>
    </Comp>
  )
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
