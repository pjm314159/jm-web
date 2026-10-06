import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emitForceLogout } from '../../lib/authEvents'
import { tokenStorage } from '../../lib/tokenStorage'
import { useAuthStore } from '../authStore'

describe('authStore 强制登出同步', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ username: null, isAuthenticated: false })
  })

  it('emitForceLogout 将已登录的 store 同步为未登录', () => {
    tokenStorage.set('access', 'refresh', 'bob')
    useAuthStore.setState({ username: 'bob', isAuthenticated: true })

    emitForceLogout()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().username).toBeNull()
  })

  it('store 未登录时 emitForceLogout 保持未登录（幂等）', () => {
    useAuthStore.setState({ username: null, isAuthenticated: false })

    emitForceLogout()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().username).toBeNull()
  })

  it('初始认证状态取自 localStorage 凭证（已登录）', async () => {
    tokenStorage.set('access', 'refresh', 'carol')
    vi.resetModules()
    const { useAuthStore: freshStore } = await import('../authStore')

    expect(freshStore.getState().isAuthenticated).toBe(true)
    expect(freshStore.getState().username).toBe('carol')
  })

  it('无凭证时初始为未登录', async () => {
    localStorage.clear()
    vi.resetModules()
    const { useAuthStore: freshStore } = await import('../authStore')

    expect(freshStore.getState().isAuthenticated).toBe(false)
    expect(freshStore.getState().username).toBeNull()
  })
})
