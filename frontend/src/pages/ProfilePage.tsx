import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'

import { getJmFavorites, getProfile, linkJmAccount, unlinkJmAccount } from '../api/profile'
import AlbumCard from '../components/AlbumCard'
import PaginationBar from '../components/PaginationBar'
import { setPageTitle } from '../lib/usePageTitle'
import { useAuthStore } from '../store/authStore'

function UserIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

function HeartIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  )
}

function LogoutIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
    </svg>
  )
}

/** 账号头像：优先远端图，加载失败回退到用户名首字。 */
function AccountAvatar({ username, src }: { username: string; src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-black text-white shadow-md">
        {username.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={username}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-full border border-white/40 object-cover shadow-md dark:border-white/10"
    />
  )
}

function errMsg(error: unknown): string {
  const e = error as AxiosError<{ error?: string }>
  return e?.response?.data?.error ?? '操作失败，请稍后重试'
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useAuthStore((s) => s.logout)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [favPage, setFavPage] = useState(1)

  useEffect(() => {
    setPageTitle('个人资料')
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const linkMutation = useMutation({
    mutationFn: () => linkJmAccount(username.trim(), password),
    onSuccess: () => {
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: unlinkJmAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })

  const account = profile?.account ?? null
  const {
    data: favorites,
    isLoading: favLoading,
    isError: favError,
    error: favErr,
    refetch: refetchFavorites,
  } = useQuery({
    queryKey: ['profile-favorites', favPage],
    queryFn: () => getJmFavorites(favPage),
    enabled: !!account,
  })

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/40 bg-white/40 text-indigo-500 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-700/40 dark:text-indigo-400">
            <UserIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">个人资料</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">关联 JM 账号并同步收藏夹</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="glass-btn glass-btn-sm glass-btn-round !px-4 !py-2"
        >
          <span className="glass-btn-overlay" />
          <span className="glass-btn-text flex items-center gap-1.5 !text-sm">
            <LogoutIcon className="h-4 w-4" />
            登出
          </span>
        </button>
      </div>

      {/* ─── 关联账号 ─── */}
      <section className="max-w-3xl rounded-3xl border border-white/40 bg-white/40 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50 sm:p-7">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
          <UserIcon className="h-5 w-5 text-indigo-500" />
          关联账号
        </h2>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
        ) : account ? (
          <div className="space-y-4">
            {/* 账号信息：单层 flex 容器，重要数据放大、次要数据弱化 */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl border border-emerald-300/50 bg-emerald-50/40 px-5 py-4 dark:border-emerald-500/20 dark:bg-emerald-950/20">
              <AccountAvatar username={account.username} src={account.avatar} />
              <span className="flex items-center gap-2">
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {account.username}
                </span>
                {account.level_name && (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {account.level_name}
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                UID{' '}
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {account.uid ?? '-'}
                </span>
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                收藏{' '}
                <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                  {account.album_favorites ?? '-'}
                </span>
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                硬币{' '}
                <span className="text-base font-black text-amber-600 dark:text-amber-400">
                  {account.coin ?? '-'}
                </span>
              </span>
              {account.email && (
                <span className="w-full text-xs text-slate-400 dark:text-slate-500">
                  {account.email}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => unlinkMutation.mutate()}
              disabled={unlinkMutation.isPending}
              className="rounded-xl border border-rose-200/60 bg-rose-50/40 px-4 py-2 text-sm font-semibold text-rose-500 transition-all hover:bg-rose-100/60 disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-400"
            >
              {unlinkMutation.isPending ? '解除中…' : '解除关联'}
            </button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (username.trim() && password) linkMutation.mutate()
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  JM 用户名
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="18comic 用户名"
                  autoComplete="username"
                  className="w-full rounded-2xl border border-white/40 bg-white/40 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  密码
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="JM 密码"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-white/40 bg-white/40 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-300/60 focus:ring-2 focus:ring-indigo-500/30 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-100"
                />
              </label>
            </div>

            {linkMutation.isError && (
              <p className="text-sm text-rose-500">{errMsg(linkMutation.error)}</p>
            )}

            <button
              type="submit"
              disabled={linkMutation.isPending || !username.trim() || !password}
              className="rounded-2xl border border-white/40 bg-indigo-500/90 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linkMutation.isPending ? '关联中…' : '关联账号'}
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              关联后可用于获取 JM 站收藏夹；密码仅用于本站登录 JM 时校验。
            </p>
          </form>
        )}
      </section>

      {/* ─── 收藏夹（与搜索页一致的网格布局 + 分页） ─── */}
      {account && (
        <>
          <div className="mt-8 mb-4 flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
              <HeartIcon className="h-5 w-5 text-rose-500" />
              收藏夹
            </h2>
            {favorites && (
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                共{' '}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {favorites.total}
                </span>{' '}
                个收藏
              </span>
            )}
          </div>

          {favLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-700/40"
                />
              ))}
            </div>
          )}

          {favError && !favLoading && (
            <div className="py-8 text-center">
              <p className="text-sm text-rose-500">{errMsg(favErr)}</p>
              <button
                type="button"
                onClick={() => refetchFavorites()}
                className="mt-3 rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-xs font-semibold text-slate-600 backdrop-blur-md transition-all hover:shadow-md dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300"
              >
                重试
              </button>
            </div>
          )}

          {favorites && favorites.albums.length === 0 && !favLoading && (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              暂无收藏
            </p>
          )}

          {favorites && favorites.albums.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {favorites.albums.map((album) => (
                  <AlbumCard
                    key={album.album_id}
                    jmId={album.album_id}
                    name={album.title}
                    author=""
                    tags={[]}
                    coverUrl={album.cover_url}
                    meta="收藏"
                    downloaded={album.is_downloaded}
                    href={`/search/album/${album.album_id}`}
                  />
                ))}
              </div>
              {favorites.page_count > 1 && (
                <PaginationBar
                  pagination={favorites}
                  onPrev={() => setFavPage(favorites.prev_num)}
                  onNext={() => setFavPage(favorites.next_num)}
                  onJump={setFavPage}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
