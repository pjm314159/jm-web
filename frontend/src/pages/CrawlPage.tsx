import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'

import { getCrawlTaskStatus, submitCrawl } from '../api/crawl'

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
              <StatusBox
                tone="success"
                title={state === 'PARTIAL' ? '部分章节下载失败' : '任务已完成'}
                detail="可前往藏书阁查看下载结果。"
              />
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
