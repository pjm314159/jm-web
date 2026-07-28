import { Navigate } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

/** 受保护路由：未登录重定向到登录页 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/** 游客路由（登录/注册页）：已登录则重定向到首页 */
export function RequireGuest({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
