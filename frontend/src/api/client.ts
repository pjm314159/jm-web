import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { tokenStorage } from '../lib/tokenStorage'

/**
 * 全局 axios 实例：
 * - baseURL 为 /api，开发环境经 Vite 代理转发到 Django（localhost:8000）
 * - 请求拦截器自动注入 JWT access token
 * - 响应拦截器在 401 时尝试用 refresh token 续期，失败则清空凭证
 */
export const apiClient = axios.create({
  baseURL: '/api',
})

apiClient.interceptors.request.use((config) => {
  const access = tokenStorage.getAccess()
  if (access) {
    config.headers.Authorization = `Bearer ${access}`
  }
  return config
})

// 刷新期间的并发控制：排队等待刷新结果，避免重复刷新
let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []

const flushQueue = (token: string | null) => {
  pendingQueue.forEach((cb) => cb(token))
  pendingQueue = []
}

// 认证相关接口本身 401 不应触发刷新（如登录失败）
const isAuthEndpoint = (url?: string) => !!url && url.includes('/auth/')

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (!original) return Promise.reject(error)

    const status = error.response?.status
    if (status !== 401 || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error)
    }

    const refresh = tokenStorage.getRefresh()
    if (!refresh) {
      tokenStorage.clear()
      return Promise.reject(error)
    }

    // 已在刷新中：排队等待新 token
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (token) {
            original.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(original))
          } else {
            reject(error)
          }
        })
      })
    }

    original._retry = true
    isRefreshing = true
    try {
      // 用裸 axios 刷新，避免触发本实例拦截器造成循环
      const { data } = await axios.post('/api/auth/token/refresh/', { refresh })
      const newAccess: string = data.access
      tokenStorage.setAccess(newAccess)
      flushQueue(newAccess)
      original.headers.Authorization = `Bearer ${newAccess}`
      return apiClient(original)
    } catch (refreshError) {
      flushQueue(null)
      tokenStorage.clear()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)
