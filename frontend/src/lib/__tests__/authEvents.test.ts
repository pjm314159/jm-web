import { describe, expect, it, vi } from 'vitest'

import { emitForceLogout, onForceLogout } from '../authEvents'

describe('authEvents 强制登出事件', () => {
  it('emit 通知所有订阅者', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    const unsubscribeA = onForceLogout(listenerA)
    onForceLogout(listenerB)

    emitForceLogout()

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(1)

    unsubscribeA()
    emitForceLogout()

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(2)
  })

  it('取消订阅后不再收到事件', () => {
    const listener = vi.fn()
    const unsubscribe = onForceLogout(listener)

    unsubscribe()
    emitForceLogout()

    expect(listener).not.toHaveBeenCalled()
  })

  it('取消订阅函数可安全重复调用', () => {
    const listener = vi.fn()
    const unsubscribe = onForceLogout(listener)

    unsubscribe()
    expect(() => unsubscribe()).not.toThrow()

    emitForceLogout()
    expect(listener).not.toHaveBeenCalled()
  })
})
