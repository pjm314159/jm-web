import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { extractErrorMessage } from '../lib/apiError'
import { useAuthStore } from '../store/authStore'

/**
 * 注册页（液态玻璃卡片）：对接后端 POST /api/auth/register/。
 * 字段对齐 RegisterSerializer：username / password / password2 / secret_key。
 * 注册成功后后端自动签发 JWT，前端直接登录并跳转首页。
 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== password2) {
      setError('两次输入的密码不一致。')
      return
    }
    setLoading(true)
    try {
      await register({
        username: username.trim(),
        password,
        password2,
        secret_key: secretKey,
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, '注册失败，请检查输入的信息'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card w-full max-w-md p-8 sm:p-10">
      <div className="glass-overlay" />
      <div className="glass-content">
        <h2 className="text-center text-3xl font-black tracking-tight text-slate-800 dark:text-white">
          创建新账号
        </h2>
        <p className="mb-4 mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          注册需要管理员提供的密钥
        </p>

        {/* 注册限制说明（对齐后端校验规则） */}
        <ul className="mb-6 space-y-1 rounded-lg border border-slate-200/70 bg-slate-50/50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:border-slate-600/50 dark:bg-slate-800/40 dark:text-slate-400">
          <li>· 用户名：仅限字母、数字及 @ . + - _</li>
          <li>· 密码：至少 8 位，不能是常见密码或纯数字</li>
          <li>· 注册密钥：由管理员提供，错误将无法注册</li>
        </ul>

        {error && (
          <div className="mb-5 rounded-lg border border-red-300/60 bg-red-50/70 px-4 py-3 text-center text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="reg-username"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              用户名
            </label>
            <input
              id="reg-username"
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
              htmlFor="reg-password"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              密码
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="new-password"
              required
              className="glass-input"
            />
          </div>

          <div>
            <label
              htmlFor="reg-password2"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              确认密码
            </label>
            <input
              id="reg-password2"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="请再次输入密码"
              autoComplete="new-password"
              required
              className="glass-input"
            />
          </div>

          <div className="border-t border-dashed border-slate-300 pt-5 dark:border-slate-500">
            <label
              htmlFor="reg-secret"
              className="mb-1.5 block text-sm font-medium text-indigo-600 dark:text-indigo-400"
            >
              注册密钥
            </label>
            <input
              id="reg-secret"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="请输入管理员密钥"
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
            <span className="glass-btn-text">{loading ? '注册中…' : '完成注册'}</span>
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
          已有账号？{' '}
          <Link
            to="/login"
            className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 hover:underline dark:text-indigo-400"
          >
            直接登录
          </Link>
        </div>
      </div>
    </div>
  )
}
