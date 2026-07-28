import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { extractErrorMessage } from '../lib/apiError'
import { useAuthStore } from '../store/authStore'

/**
 * 登录页（液态玻璃卡片）：对接后端 POST /api/auth/token/。
 * 成功后保存 JWT 并跳转首页；失败展示后端返回的错误。
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, '用户名或密码错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card w-full max-w-md p-8 sm:p-10">
      <div className="glass-overlay" />
      <div className="glass-content">
        <h2 className="text-center text-3xl font-black tracking-tight text-slate-800 dark:text-white">
          欢迎回来
        </h2>
        <p className="mb-8 mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          请登录以管理您的漫画库
        </p>

        {error && (
          <div className="mb-5 rounded-lg border border-red-300/60 bg-red-50/70 px-4 py-3 text-center text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              required
              className="glass-input"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              required
              className="glass-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="glass-btn disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="glass-btn-overlay" />
            <span className="glass-btn-text">{loading ? '登录中…' : '立即登录'}</span>
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
          还没有账号？{' '}
          <Link
            to="/register"
            className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 hover:underline dark:text-indigo-400"
          >
            去注册
          </Link>
        </div>
      </div>
    </div>
  )
}
