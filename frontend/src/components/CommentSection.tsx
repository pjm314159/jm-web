/**
 * 评论区组件（feat.md：参考留言板样式，融合液态玻璃风格）：
 * - 头像 + 昵称 + 相对时间 + 点赞数
 * - 嵌套回复（reply 层级缩进，深层级不再继续缩进）
 * - 剧透评论模糊遮罩，点击显示
 * - IntersectionObserver 哨兵实现滚动加载下一页
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { getSearchAlbumComments, type AlbumComment } from '../api/search'

/* ─── 头像渐变调色板 ──────────────────────────────────── */
const AVATAR_GRADIENTS = [
  'from-indigo-400 to-purple-500',
  'from-sky-400 to-cyan-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-violet-400 to-fuchsia-500',
  'from-blue-400 to-indigo-500',
  'from-teal-400 to-emerald-500',
]

function hashStr(s: string): number {
  let h = 0
  for (const ch of s) {
    h = Math.trunc(Math.imul(h, 31) + (ch.codePointAt(0) ?? 0))
  }
  return Math.abs(h)
}

/* ─── 相对时间 ────────────────────────────────────────── */
function relTime(raw: string | number | null): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const ts = Number(raw)
  if (!Number.isFinite(ts) || ts <= 0) return String(raw)
  const diffSec = Math.floor(Date.now() / 1000 - ts)
  if (diffSec < 0) return ''
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} 天前`
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─── 头像（无远端头像，用昵称首字符 + 确定性渐变色） ── */
function Avatar({ name, seed, small = false }: { name: string; seed: string; small?: boolean }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  const gradient = AVATAR_GRADIENTS[hashStr(seed || name || '?') % AVATAR_GRADIENTS.length]
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-bold text-white shadow-sm ${
        small ? 'h-7 w-7 text-[11px]' : 'h-10 w-10 text-sm'
      }`}
    >
      {initial}
    </div>
  )
}

/* ─── 图标 ────────────────────────────────────────────── */
function ThumbUpIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.612 2.612 0 0117 5.07c0 .426-.058.852-.174 1.265l-1.025 3.663a2.25 2.25 0 002.17 2.86h2.58a2.25 2.25 0 012.166 2.937l-1.545 4.875A2.25 2.25 0 0119.005 22H8.25a2.25 2.25 0 01-2.25-2.25v-8a2.25 2.25 0 012.25-2.25h.383z" />
    </svg>
  )
}
function ReplyIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  )
}
function SpinnerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

/* ─── 单条评论（递归渲染嵌套回复） ────────────────────── */
function CommentItem({
  comment,
  depth,
  revealed,
  onToggleSpoiler,
}: {
  comment: AlbumComment
  depth: number
  revealed: Set<string>
  onToggleSpoiler: (key: string) => void
}) {
  const key = comment.comment_id ?? `${comment.user_id}-${comment.created_at}`
  const isReply = depth > 0
  const displayName = comment.nickname || comment.username || '匿名用户'
  const showSpoiler = comment.is_spoiler && !revealed.has(key)

  return (
    <div className={isReply ? 'mt-3 flex gap-2.5' : 'flex gap-3.5'}>
      <Avatar name={displayName} seed={comment.user_id ?? displayName} small={isReply} />
      <div className="min-w-0 flex-1">
        {/* 头部：昵称 + 时间 */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`font-bold text-slate-800 dark:text-slate-100 ${isReply ? 'text-[13px]' : 'text-sm'}`}>
            {displayName}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{relTime(comment.created_at)}</span>
          {comment.is_spoiler && (
            <span className="rounded-full bg-amber-500/10 px-2 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              剧透
            </span>
          )}
        </div>

        {/* 内容（剧透模糊，点击显示） */}
        <div
          className={`relative mt-1 overflow-hidden rounded-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 ${
            showSpoiler ? 'cursor-pointer' : ''
          }`}
          onClick={showSpoiler ? () => onToggleSpoiler(key) : undefined}
        >
          <p
            className={`whitespace-pre-wrap break-words transition-all duration-300 ${
              showSpoiler ? 'select-none blur-sm' : ''
            }`}
          >
            {comment.content}
          </p>
          {showSpoiler && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/40 text-xs font-semibold text-slate-500 backdrop-blur-[2px] dark:bg-slate-900/40 dark:text-slate-400">
              剧透内容，点击显示
            </span>
          )}
        </div>

        {/* 操作行：点赞数 + 回复数 */}
        <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          {comment.likes !== null && (
            <span className="flex items-center gap-1">
              <ThumbUpIcon className="h-3.5 w-3.5" />
              {comment.likes}
            </span>
          )}
          {comment.replies.length > 0 && (
            <span className="flex items-center gap-1">
              <ReplyIcon className="h-3.5 w-3.5" />
              {comment.replies.length} 条回复
            </span>
          )}
        </div>

        {/* 嵌套回复 */}
        {comment.replies.length > 0 && (
          <div className="mt-2 flex flex-col rounded-2xl border border-white/30 bg-white/20 p-3 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/20">
            {comment.replies.map((reply, i) => (
              <CommentItem
                key={reply.comment_id ?? `${key}-r${i}`}
                comment={reply}
                depth={Math.min(depth + 1, 2)}
                revealed={revealed}
                onToggleSpoiler={onToggleSpoiler}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 评论区主组件 ────────────────────────────────────── */
export default function CommentSection({
  jmId,
  showHeader = true,
}: {
  jmId: string
  /** 嵌入抽屉等已有标题的容器时可隐藏自带标题栏，避免重复标题与多余间距 */
  showHeader?: boolean
}) {
  const [pages, setPages] = useState<AlbumComment[][]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const pageRef = useRef(0)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasNext) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await getSearchAlbumComments(jmId, pageRef.current + 1)
      pageRef.current += 1
      setPages((prev) => [...prev, res.comments])
      setTotal(res.total)
      setHasNext(res.has_next)
    } catch {
      setError('评论加载失败，请稍后重试')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [jmId, hasNext])

  // 哨兵进入视口自动加载下一页
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: '400px' },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [loadMore])

  const toggleSpoiler = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const loadedCount = pages.reduce((n, p) => n + p.length, 0)
  const started = pages.length > 0

  return (
    <section className={showHeader ? 'mt-12' : ''}>
      {/* 标题栏 */}
      {showHeader && (
        <div className="mb-5 flex items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
            <ReplyIcon className="h-5 w-5 text-indigo-500" />
            评论
          </h2>
          {total !== null && total > 0 && (
            <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {total}
            </span>
          )}
        </div>
      )}

      {/* 评论列表（液态玻璃卡片） */}
      <div className="rounded-3xl border border-white/40 bg-white/30 p-5 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40 sm:p-6">
        {started && loadedCount > 0 && (
          <div className="flex flex-col gap-6">
            {pages.flat().map((comment, i) => (
              <CommentItem
                key={comment.comment_id ?? `p-${i}`}
                comment={comment}
                depth={0}
                revealed={revealed}
                onToggleSpoiler={toggleSpoiler}
              />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {started && loadedCount === 0 && !loading && (
          <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            暂无评论，快来抢沙发
          </div>
        )}

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400 dark:text-slate-500">
            <SpinnerIcon className="h-4 w-4" />
            正在加载评论…
          </div>
        )}

        {/* 错误重试 */}
        {error && !loading && (
          <div className="py-8 text-center">
            <p className="text-sm text-rose-500">{error}</p>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="mt-3 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-xs font-semibold text-slate-600 backdrop-blur-md transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
            >
              重试
            </button>
          </div>
        )}

        {/* 到底提示 */}
        {!hasNext && loadedCount > 0 && (
          <div className="mt-6 border-t border-slate-200/50 pt-4 text-center text-xs text-slate-400 dark:border-slate-700/40 dark:text-slate-500">
            已加载全部评论
          </div>
        )}
      </div>

      {/* 滚动加载哨兵 */}
      <div ref={sentinelRef} className="h-px" />
    </section>
  )
}
