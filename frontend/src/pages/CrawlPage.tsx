import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'

import { getCrawlTaskStatus, getCrawlTasks, submitCrawl } from '../api/crawl'

/**
 * 爬虫中心（基于旧 crawl_form.html 重构）：
 * - 输入 JM ID / 链接，提交后台 Celery 异步下载任务（C1）
 * - 提交后轮询任务状态（C2），展示下载进度条 / 成功 / 失败
 * - 毛玻璃风格，与搜索页视觉一致
 */

/** 下载图标。 */
function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

/** 进度条（章节下载进度）。 */
function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
        <span>正在下载…</span>
        <span className="font-mono">
          {current} / {total} 章 · {percent}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-700/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** 书本图标（复用 SearchDetailPage 样式）。 */
function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

/** 状态提示框（成功 / 失败 / 等待）。 */
function StatusBox({
  tone,
  title,
  detail,
}: {
  tone: 'success' | 'error' | 'pending'
  title: string
  detail?: string
}) {
  const tones = {
    success:
      'border-emerald-300/60 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    error:
      'border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
    pending:
      'border-indigo-300/60 bg-indigo-50/60 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300',
  } as const
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm backdrop-blur-md ${tones[tone]}`}>
      <div className="flex items-center gap-2 font-bold">
        {tone === 'pending' && (
          <span className="h-2 w-2 animate-ping rounded-full bg-indigo-500 dark:bg-indigo-400" />
        )}
        {title}
      </div>
      {detail && <p className="mt-1 break-words text-xs opacity-90">{detail}</p>}
    </div>
  )
}

export default function CrawlPage() {
  const [input, setInput] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'complete' | 'detail'>('complete')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mutation = useMutation({
    mutationFn: () => submitCrawl(input.trim()),
    onSuccess: (data) => {
      setSubmitError(null)
      setTaskId(data.task_id)
    },
    onError: (error) => {
      const err = error as AxiosError<{ error?: string; input?: string[] }>
      setSubmitError(
        err.response?.data?.error ?? err.response?.data?.input?.[0] ?? '提交失败，请稍后重试',
      )
    },
  })

  // 提交后轮询任务状态，到达终态后停止
  const { data: taskStatus } = useQuery({
    queryKey: ['crawl-task', taskId],
    queryFn: () => getCrawlTaskStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state === 'SUCCESS' || state === 'PARTIAL' || state === 'FAILED' ? false : 1500
    },
  })

  // 所有正在下载的任务（轮询刷新）
  const { data: activeTasks } = useQuery({
    queryKey: ['crawl-tasks'],
    queryFn: getCrawlTasks,
    refetchInterval: 3000,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setTaskId(null)
    setSubmitError(null)
    mutation.mutate()
  }

  const state = taskStatus?.state
  const isPending = !!taskId && (!state || state === 'DOWNLOADING')
  const isProgress = state === 'PROGRESS'
  const isSuccess = state === 'SUCCESS' || state === 'PARTIAL'
  const isFailure = state === 'FAILED'
  const showStatus = !!submitError || !!taskId

  // 两阶段动效：下载完成 → 2s 后切换为「查看本地详情」按钮
  useEffect(() => {
    if (isSuccess) {
      setPhase('complete')
      timerRef.current = setTimeout(() => setPhase('detail'), 2000)
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
  }, [isSuccess])

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-xl px-4 pb-16 sm:px-6">
      <div className="rounded-3xl border border-white/40 bg-white/40 p-7 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50 sm:p-8">
        {/* 标题 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/40 text-indigo-500 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-700/40 dark:text-indigo-400">
            <DownloadIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">新建下载任务</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              输入本子或章节的 ID / 链接，后台异步下载
            </p>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="crawl-input"
              className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              JM ID 或 链接
            </label>
            <input
              id="crawl-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如: 427413 或 链接..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-white/40 bg-white/40 px-4 py-3 text-base font-medium text-slate-800 placeholder-slate-400 shadow-sm backdrop-blur-md outline-none transition-all focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              支持 Album ID（本子）和 Photo ID（章节）。
            </p>
          </div>

          {/* 毛玻璃提交按钮 */}
          <button
            type="submit"
            disabled={mutation.isPending || !input.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white/40 px-6 py-3 text-sm font-bold text-slate-700 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:text-indigo-400"
          >
            <DownloadIcon className="h-5 w-5" />
            {mutation.isPending ? '提交中…' : '启动爬虫'}
          </button>
        </form>

        {/* 状态区 */}
        {showStatus && (
          <div className="mt-6 space-y-3 border-t border-dashed border-slate-300/60 pt-5 dark:border-slate-600/60">
            {submitError && <StatusBox tone="error" title="提交失败" detail={submitError} />}

            {!submitError && isPending && (
              <StatusBox tone="pending" title="任务已提交，正在等待下载…" detail="后台正在排队处理，请耐心等待" />
            )}

            {!submitError && isProgress && taskStatus?.progress && (
              <ProgressBar
                current={taskStatus.progress.chapters_done}
                total={taskStatus.progress.chapters_total}
              />
            )}

            {!submitError && isSuccess && (
              <div className="relative">
                {/* 阶段一：下载完成提示 */}
                <div
                  className={`transition-all duration-300 ${
                    phase === 'complete'
                      ? 'scale-100 opacity-100'
                      : 'pointer-events-none absolute inset-0 scale-95 opacity-0'
                  }`}
                >
                  <StatusBox
                    tone="success"
                    title={state === 'PARTIAL' ? '部分章节下载失败' : '下载完成 ✓'}
                    detail={state === 'PARTIAL' ? '可前往藏书阁查看下载结果。' : undefined}
                  />
                </div>
                {/* 阶段二：查看本地详情按钮（复用 SearchDetailPage 样式） */}
                <div
                  className={`transition-all duration-300 ${
                    phase === 'detail'
                      ? 'scale-100 opacity-100'
                      : 'pointer-events-none absolute inset-0 scale-95 opacity-0'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        taskStatus?.album_id ? `/library/${taskStatus.album_id}` : '/library',
                        '_blank',
                      )
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200/50 bg-emerald-50/40 px-6 py-3 text-sm font-semibold text-emerald-600 shadow-md backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-emerald-300/60 hover:shadow-lg active:scale-95 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400"
                  >
                    <BookIcon className="h-4 w-4" />
                    查看本地详情
                  </button>
                </div>
              </div>
            )}

            {!submitError && isFailure && (
              <StatusBox tone="error" title="任务执行失败" detail={taskStatus?.error} />
            )}

            {taskId && (
              <p className="text-center font-mono text-[10px] text-slate-400 dark:text-slate-500">
                Task ID: {taskId}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 正在下载列表 */}
      <div className="mt-6 rounded-3xl border border-white/40 bg-white/40 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
        <div className="mb-4 flex items-center gap-2">
          <DownloadIcon className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">正在下载</h2>
          <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            {activeTasks?.count ?? 0}
          </span>
        </div>

        {activeTasks?.error ? (
          <p className="text-sm text-rose-500">下载服务不可达，请稍后重试</p>
        ) : !activeTasks || activeTasks.tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            暂无进行中的下载
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeTasks.tasks.map((task) => (
              <div
                key={task.crawl_id}
                className="rounded-2xl border border-white/40 bg-white/30 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40"
              >
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={task.jm_type !== 'album'}
                    onClick={
                      task.jm_type === 'album'
                        ? () => window.open(`/search/album/${task.jm_id}`, '_blank')
                        : undefined
                    }
                    className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700 transition-colors hover:text-indigo-600 disabled:cursor-default disabled:hover:text-slate-700 dark:text-slate-200 dark:hover:text-indigo-400 dark:disabled:hover:text-slate-200"
                  >
                    <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-indigo-500 dark:bg-indigo-400" />
                    <span className="truncate">JM-{task.jm_id}</span>
                  </button>
                  <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                    {task.jm_type === 'album' ? '本子' : '章节'}
                  </span>
                </div>
                <ProgressBar
                  current={task.progress.chapters_done}
                  total={task.progress.chapters_total}
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                  图片 {task.progress.images_done} / {task.progress.images_total}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部链接 */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="rounded-2xl border border-white/40 bg-white/40 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:text-indigo-400"
        >
          返回首页
        </Link>
        <Link
          to="/library"
          className="rounded-2xl border border-white/40 bg-white/40 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:text-indigo-400"
        >
          查看已下载
        </Link>
      </div>
    </div>
  )
}
