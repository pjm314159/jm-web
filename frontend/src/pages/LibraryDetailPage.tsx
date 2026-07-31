/**
 * 藏书阁二级详情页（design.md L48-50, L55）：
 * - 液态玻璃风格，列表行章节展示
 * - 处理空状态：简介/作者/标签/章节名/封面 均可为空
 * - 功能：检查更新、删除本子、章节分页
 * 路由：/library/:id
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  checkAlbumUpdates,
  deleteAlbum,
  getAlbumDetail,
  type CheckUpdateResult,
} from '../api/library'
import { getCrawlTaskStatus, submitCrawl } from '../api/crawl'
import { setPageTitle } from '../lib/usePageTitle'

/* ─── 图标 ──────────────────────────────────────────────── */
function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}
function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}
function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}
function CalendarIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}
function LayersIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
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
function CheckCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/* ─── 章节分页 ──────────────────────────────────────────── */
const EP_PER_PAGE = 24

/* ─── 加载骨架 ──────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="mx-auto mt-24 w-full max-w-5xl animate-pulse px-4 pb-24 sm:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-slate-200/70 dark:bg-slate-700/50">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/5" />
          </div>
          <div className="h-11 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
          <div className="h-11 rounded-2xl bg-slate-200/70 dark:bg-slate-700/50" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="h-9 w-3/4 rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
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
export default function LibraryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [epPage, setEpPage] = useState(1)
  const [updateResult, setUpdateResult] = useState<CheckUpdateResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 清理轮询
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const { data: album, isLoading, isError } = useQuery({
    queryKey: ['library-detail', id],
    queryFn: () => getAlbumDetail(Number(id)),
    enabled: !!id,
  })

  useEffect(() => {
    if (album?.name) setPageTitle(album.name)
  }, [album?.name])

  const deleteMutation = useMutation({
    mutationFn: () => deleteAlbum(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] })
      navigate('/library')
    },
  })

  const handleCheckUpdate = async () => {
    if (!id) return
    setChecking(true)
    setUpdateResult(null)
    try {
      const result = await checkAlbumUpdates(Number(id))
      setUpdateResult(result)
      if (result.has_updates) {
        queryClient.invalidateQueries({ queryKey: ['library-detail', id] })
      }
    } catch {
      setUpdateResult(null)
    } finally {
      setChecking(false)
    }
  }

  const handleUpdateDownload = async () => {
    if (!album?.jm_id || updating) return
    setUpdating(true)
    setUpdateMsg('提交更新任务…')
    try {
      const res = await submitCrawl(album.jm_id)
      setUpdateMsg(res.message || '任务已提交，正在下载新章节…')
      // 轮询进度
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const st = await getCrawlTaskStatus(res.task_id)
          if (st.state === 'SUCCESS' || st.state === 'PARTIAL') {
            if (pollRef.current) clearInterval(pollRef.current)
            setUpdating(false)
            setUpdateMsg(st.state === 'SUCCESS' ? '更新完成' : '部分章节下载失败')
            queryClient.invalidateQueries({ queryKey: ['library-detail', id] })
            setUpdateResult(null)
          } else if (st.state === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current)
            setUpdating(false)
            setUpdateMsg('更新失败')
          } else if (st.progress) {
            setUpdateMsg(`下载中 ${st.progress.images_done}/${st.progress.images_total} 张`)
          }
        } catch { /* 轮询失败静默忽略 */ }
      }, 2000)
    } catch {
      setUpdating(false)
      setUpdateMsg('提交失败，请稍后重试')
    }
  }

  if (isLoading) return <LoadingSkeleton />

  if (isError || !album) {
    return (
      <div className="relative z-10 mx-auto mt-32 w-full max-w-5xl px-4 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">加载失败或本子不存在。</p>
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="mt-4 rounded-xl border border-white/40 bg-white/40 px-5 py-2.5 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
        >
          返回书架
        </button>
      </div>
    )
  }

  const photos = album.photos ?? []
  const epPageCount = Math.max(1, Math.ceil(photos.length / EP_PER_PAGE))
  const safePage = Math.min(epPage, epPageCount)
  const pagedPhotos = photos.slice((safePage - 1) * EP_PER_PAGE, safePage * EP_PER_PAGE)

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-4 pb-24 sm:px-6 lg:px-10">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={() => navigate('/library')}
        className="group mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <span className="rounded-lg border border-white/50 bg-white/40 p-1.5 shadow-sm backdrop-blur-md transition-all group-hover:shadow-md dark:border-white/10 dark:bg-slate-800/50">
          <ChevronLeftIcon className="h-4 w-4" />
        </span>
        返回书架
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        {/* ─── 左侧：封面 + 操作 ─── */}
        <aside className="flex flex-col gap-4">
          {/* 封面 */}
          <div className="group relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-3 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-800/50">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-200/60 dark:bg-slate-700/50">
              {album.cover_url ? (
                <img
                  src={album.cover_url}
                  alt={album.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-emerald-500/20 via-teal-500/15 to-cyan-500/20">
                  <BookIcon className="h-16 w-16 text-emerald-400/60" />
                  <span className="px-4 text-center text-sm font-bold text-emerald-400/70 dark:text-emerald-400/50">
                    暂无封面
                  </span>
                </div>
              )}
            </div>
            <span className="absolute left-5 top-5 rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              JM-{album.jm_id}
            </span>
          </div>

          {/* 检查更新 */}
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checking}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white/50 px-6 py-3 text-sm font-bold text-emerald-600 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-emerald-300/60 hover:shadow-xl active:scale-95 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-slate-800/60 dark:text-emerald-400"
          >
            <RefreshIcon className={`h-5 w-5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? '检测中...' : '检查更新'}
          </button>

          {/* 删除 */}
          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-red-200/60 bg-red-50/60 p-4 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-950/30">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                确定删除？将同时移除硬盘文件！
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-red-600 active:scale-95 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? '删除中...' : '确认删除'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-white active:scale-95 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-red-200/50 bg-red-50/50 px-6 py-3 text-sm font-bold text-red-500 shadow-lg backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-red-300/70 hover:bg-red-100/60 hover:shadow-xl active:scale-95 dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-400"
            >
              <TrashIcon className="h-5 w-5" />
              删除此本子
            </button>
          )}
        </aside>

        {/* ─── 右侧：详情 + 章节 ─── */}
        <main className="flex min-w-0 flex-col gap-6">
          {/* 标题 */}
          <h1 className="text-2xl font-black leading-tight tracking-wide text-slate-900 dark:text-white sm:text-3xl">
            {album.name}
          </h1>

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-3">
            <MetaChip label="JM ID" value={album.jm_id} iconBg="bg-indigo-500/10 dark:bg-indigo-400/10" iconColor="text-indigo-500 dark:text-indigo-400" icon={<BookIcon className="h-4 w-4" />} onClick={() => window.open(`/search/album/${album.jm_id}`, '_blank')} />
            {album.author && (
              <MetaChip label="作者" value={album.author} iconBg="bg-violet-500/10 dark:bg-violet-400/10" iconColor="text-violet-500 dark:text-violet-400" icon={<UserIcon className="h-4 w-4" />} onClick={() => navigate(`/search?q=${encodeURIComponent(album.author!)}&type=keyword&page=1`)} />
            )}
            <MetaChip label="总章节" value={`${album.total_episodes} 话`} iconBg="bg-emerald-500/10 dark:bg-emerald-400/10" iconColor="text-emerald-500 dark:text-emerald-400" icon={<LayersIcon className="h-4 w-4" />} />
            <MetaChip label="入库时间" value={album.created_at.slice(0, 10)} iconBg="bg-amber-500/10 dark:bg-amber-400/10" iconColor="text-amber-500 dark:text-amber-400" icon={<CalendarIcon className="h-4 w-4" />} />
          </div>

          {/* 标签（可能为空，点击跳转搜索） */}
          {album.tags && album.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {album.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(tag)}&type=tag&page=1`)}
                  className="cursor-pointer rounded-full border border-white/40 bg-white/40 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur-sm transition-all hover:border-emerald-300/60 hover:bg-emerald-50/50 hover:text-emerald-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* 简介（可能为空） */}
          {album.description ? (
            <div className="rounded-2xl border border-white/40 bg-white/30 p-5 text-sm leading-relaxed text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300">
              {album.description}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200/60 bg-slate-50/30 p-5 text-sm text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/20 dark:text-slate-500">
              暂无简介
            </div>
          )}

          {/* 检查更新结果 */}
          {updateResult && <UpdateNotice result={updateResult} onUpdate={handleUpdateDownload} updating={updating} />}
          {/* 更新进度反馈 */}
          {updateMsg && (
            <span className={`animate-update-pop-in inline-flex items-center gap-1.5 text-xs font-semibold ${
              updating ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {updating && <span className="animate-update-pulse-dot h-1.5 w-1.5 rounded-full bg-indigo-500" />}
              {updateMsg}
            </span>
          )}

          {/* ─── 章节目录 ─── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <LayersIcon className="h-5 w-5 text-emerald-500" />
                章节列表
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {photos.length} 话
                </span>
              </h2>
              {epPageCount > 1 && (
                <span className="text-xs font-medium text-slate-400">
                  {safePage} / {epPageCount}
                </span>
              )}
            </div>

            {photos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/60 bg-slate-50/30 p-8 text-center text-sm text-slate-400 dark:border-slate-700/40 dark:bg-slate-800/20 dark:text-slate-500">
                暂无章节信息
              </div>
            ) : (
              <>
                {/* 章节列表行 */}
                <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/30 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40">
                  {pagedPhotos.map((photo, i) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => photo.is_downloaded && navigate(`/library/reader/${photo.id}`)}
                      disabled={!photo.is_downloaded}
                      className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:hover:bg-emerald-500/15 dark:disabled:hover:bg-transparent ${
                        i !== pagedPhotos.length - 1 ? 'border-b border-slate-200/50 dark:border-slate-700/40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          photo.is_downloaded
                            ? 'bg-slate-100/80 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400'
                            : 'bg-amber-100/80 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                        }`}>
                          {photo.sort_index}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {photo.name || `第${photo.sort_index}话`}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {!photo.is_downloaded && (
                          <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-black text-white">NEW</span>
                        )}
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                      </span>
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
                      className="flex items-center gap-1 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:border-emerald-300/60 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">上一页</span>
                    </button>
                    <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
                      <span className="text-emerald-600 dark:text-emerald-400">{safePage}</span>
                      <span className="mx-1 text-slate-400">/</span>
                      {epPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEpPage((p) => Math.min(epPageCount, p + 1))}
                      disabled={safePage >= epPageCount}
                      className="flex items-center gap-1 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-sm font-semibold text-slate-600 backdrop-blur-md transition-all hover:border-emerald-300/60 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
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
    </div>
  )
}

/* ─── 更新通知 ──────────────────────────────────────────── */
function UpdateNotice({ result, onUpdate, updating }: { result: CheckUpdateResult; onUpdate: () => void; updating: boolean }) {
  if (!result.has_updates) {
    return (
      <div className="animate-update-pop-in inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/40 px-4 py-2 shadow-md backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          已是最新 · {result.local_count}/{result.remote_count} 章
        </span>
      </div>
    )
  }
  return (
    <div className="animate-update-pop-in inline-flex items-center gap-2.5 rounded-full border border-white/40 bg-white/40 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
      <span className="relative flex items-center gap-2">
        <span className="animate-update-pulse-dot h-2 w-2 rounded-full bg-indigo-500" />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {result.new_count} 个新章节
        </span>
      </span>
      <button
        type="button"
        onClick={onUpdate}
        disabled={updating}
        className="glass-btn glass-btn-sm !py-1 !px-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="glass-btn-overlay" />
        <span className="glass-btn-text !text-[11px]">
          {updating ? '更新中…' : '一键更新'}
        </span>
      </button>
    </div>
  )
}

/* ─── 辅助组件 ──────────────────────────────────────────── */
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
