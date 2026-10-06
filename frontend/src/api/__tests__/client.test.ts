import axios, { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onForceLogout } from '../../lib/authEvents'
import { tokenStorage } from '../../lib/tokenStorage'
import { apiClient } from '../client'

/** 构造带 config 的 axios 响应对象 */
function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config }
}

/** 构造 401 错误（携带 response，模拟服务端令牌过期） */
function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'Request failed with status code 401',
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    respond(config, 401, { detail: '令牌无效或已过期' }),
  )
}

/** 替换 apiClient 的 adapter，按 handler 决定成功/失败，避免真实网络请求 */
function installAdapter(handler: (config: InternalAxiosRequestConfig) => AxiosResponse) {
  apiClient.defaults.adapter = (config) => Promise.resolve(handler(config as InternalAxiosRequestConfig))
}

/** 恒定返回 401 的 handler */
const always401 = (config: InternalAxiosRequestConfig): AxiosResponse => {
  throw unauthorized(config)
}

/** 从请求 config 中读取 Authorization 头 */
function authHeader(config: InternalAxiosRequestConfig): string {
  return String(new AxiosHeaders(config.headers).get('Authorization'))
}

describe('apiClient 401 拦截器（登录过期处理）', () => {
  let onLogout: () => void
  let unsubscribe: () => void

  beforeEach(() => {
    localStorage.clear()
    onLogout = vi.fn()
    unsubscribe = onForceLogout(onLogout)
  })

  afterEach(() => {
    unsubscribe()
    vi.restoreAllMocks()
    apiClient.defaults.adapter = undefined
  })

  it('401 且无 refresh token：清空凭证并发出强制登出事件', async () => {
    // 仅残留过期 access，无 refresh
    tokenStorage.setAccess('expired-access')
    installAdapter(always401)

    await expect(apiClient.get('/library/albums/')).rejects.toThrow(AxiosError)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(tokenStorage.getAccess()).toBeNull()
    expect(tokenStorage.getRefresh()).toBeNull()
    expect(tokenStorage.getUser()).toBeNull()
  })

  it('401 且刷新成功：携带新 token 重试并更新凭证，不强制登出', async () => {
    tokenStorage.set('expired-access', 'valid-refresh', 'alice')
    const refreshSpy = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { access: 'new-access', refresh: 'new-refresh' } } as AxiosResponse)
    const seenAuth: string[] = []
    installAdapter((config) => {
      seenAuth.push(authHeader(config))
      if (seenAuth.length === 1) throw unauthorized(config)
      return respond(config, 200, { ok: true })
    })

    const { data } = await apiClient.get('/library/albums/')

    expect(data).toEqual({ ok: true })
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(String(refreshSpy.mock.calls[0][0])).toContain('/auth/token/refresh/')
    expect(refreshSpy.mock.calls[0][1]).toEqual({ refresh: 'valid-refresh' })
    expect(seenAuth).toEqual(['Bearer expired-access', 'Bearer new-access'])
    expect(tokenStorage.getAccess()).toBe('new-access')
    // 旋转机制：服务端返回新 refresh，必须保存新值
    expect(tokenStorage.getRefresh()).toBe('new-refresh')
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('401 且刷新失败（refresh 也过期）：清空凭证并强制登出', async () => {
    tokenStorage.set('expired-access', 'invalid-refresh', 'alice')
    vi.spyOn(axios, 'post').mockRejectedValueOnce(new AxiosError('token_not_valid'))
    installAdapter(always401)

    await expect(apiClient.get('/library/albums/')).rejects.toThrow(AxiosError)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(tokenStorage.getAccess()).toBeNull()
    expect(tokenStorage.getRefresh()).toBeNull()
    expect(tokenStorage.getUser()).toBeNull()
  })

  it('刷新成功但重试仍 401：清空凭证并强制登出', async () => {
    tokenStorage.set('expired-access', 'valid-refresh', 'alice')
    vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: { access: 'new-access' } } as AxiosResponse)
    installAdapter(always401)

    await expect(apiClient.get('/library/albums/')).rejects.toThrow(AxiosError)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(tokenStorage.getAccess()).toBeNull()
  })

  it('登录接口 401（密码错误）不触发强制登出', async () => {
    installAdapter(always401)

    await expect(apiClient.post('/auth/token/', { username: 'a', password: 'b' })).rejects.toThrow(AxiosError)

    expect(onLogout).not.toHaveBeenCalled()
  })

  it('并发 401 只刷新一次，排队请求共享新 token 重试成功', async () => {
    tokenStorage.set('expired-access', 'valid-refresh', 'alice')
    const refreshSpy = vi.spyOn(axios, 'post').mockImplementation(async () => {
      // 模拟网络延迟，确保后续 401 请求进入排队而非重复刷新
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      return { data: { access: 'new-access', refresh: 'new-refresh' } } as AxiosResponse
    })
    const retriedAuth: string[] = []
    installAdapter((config) => {
      if (authHeader(config) === 'Bearer expired-access') throw unauthorized(config)
      retriedAuth.push(authHeader(config))
      return respond(config, 200, { ok: true })
    })

    const results = await Promise.all([
      apiClient.get('/library/albums/'),
      apiClient.get('/library/albums/?page=2'),
      apiClient.get('/library/albums/?page=3'),
    ])

    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(retriedAuth).toEqual(['Bearer new-access', 'Bearer new-access', 'Bearer new-access'])
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('非 401 错误（如 500）不触发刷新与强制登出', async () => {
    tokenStorage.set('valid-access', 'valid-refresh', 'alice')
    const refreshSpy = vi.spyOn(axios, 'post')
    installAdapter((config) => {
      throw new AxiosError(
        'Internal Server Error',
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        respond(config, 500, { detail: '服务器错误' }),
      )
    })

    await expect(apiClient.get('/library/albums/')).rejects.toThrow(AxiosError)

    expect(refreshSpy).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
    expect(tokenStorage.getAccess()).toBe('valid-access')
  })
})
