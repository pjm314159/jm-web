/**
 * JWT token 的 localStorage 读写工具。
 * 独立于 store 与 axios，避免循环依赖（axios 拦截器与 zustand store 都依赖它）。
 */
const ACCESS_KEY = 'jm-access-token'
const REFRESH_KEY = 'jm-refresh-token'
const USER_KEY = 'jm-username'

export const tokenStorage = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),
  getUser: (): string | null => localStorage.getItem(USER_KEY),

  /** 登录/注册成功后保存一组凭证 */
  set: (access: string, refresh: string, username?: string): void => {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
    if (username) localStorage.setItem(USER_KEY, username)
  },

  /** 刷新 token 后仅更新 access */
  setAccess: (access: string): void => {
    localStorage.setItem(ACCESS_KEY, access)
  },

  /** 登出时清空 */
  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}
