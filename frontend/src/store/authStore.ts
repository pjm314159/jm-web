import { create } from 'zustand'

import * as authApi from '../api/auth'
import type { RegisterPayload } from '../api/auth'
import { onForceLogout } from '../lib/authEvents'
import { tokenStorage } from '../lib/tokenStorage'

interface AuthState {
  username: string | null
  isAuthenticated: boolean
  /** 登录成功后保存凭证并更新状态 */
  login: (username: string, password: string) => Promise<void>
  /** 注册成功后自动登录 */
  register: (payload: RegisterPayload) => Promise<void>
  /** 登出：拉黑 refresh token 并清空本地凭证 */
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  username: tokenStorage.getUser(),
  isAuthenticated: !!tokenStorage.getAccess(),

  login: async (username, password) => {
    const { access, refresh } = await authApi.login(username, password)
    tokenStorage.set(access, refresh, username)
    set({ username, isAuthenticated: true })
  },

  register: async (payload) => {
    const { access, refresh, username } = await authApi.register(payload)
    tokenStorage.set(access, refresh, username)
    set({ username, isAuthenticated: true })
  },

  logout: async () => {
    const refresh = tokenStorage.getRefresh()
    if (refresh) {
      // 拉黑失败不阻断本地登出
      try {
        await authApi.logout(refresh)
      } catch {
        // ignore
      }
    }
    tokenStorage.clear()
    set({ username: null, isAuthenticated: false })
  },
}))

// 登录过期（refresh 失效）时由 axios 拦截器发出强制登出事件：
// 同步 store 状态，使 RequireAuth 自动跳转登录页
onForceLogout(() => useAuthStore.setState({ username: null, isAuthenticated: false }))
