import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PaginationBar, { type PaginationInfo } from '../PaginationBar'

/** 中间页：上一页/下一页均可用 */
const midPagination: PaginationInfo = {
  current: 2,
  total: 30,
  page_count: 3,
  has_prev: true,
  has_next: true,
  prev_num: 1,
  next_num: 3,
}

function setup(pagination: PaginationInfo) {
  const handlers = { onPrev: vi.fn(), onNext: vi.fn(), onJump: vi.fn() }
  const user = userEvent.setup()
  render(<PaginationBar pagination={pagination} {...handlers} />)
  return { handlers, user }
}

describe('PaginationBar 翻页滚动', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('点击下一页：触发 onNext 并回到列表顶部', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    await user.click(screen.getByRole('button', { name: '下一页' }))

    expect(handlers.onNext).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('点击上一页：触发 onPrev 并回到列表顶部', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    await user.click(screen.getByRole('button', { name: '上一页' }))

    expect(handlers.onPrev).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('跳转输入页码：onJump 收到页码、输入框清空并回到顶部', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    const input = screen.getByRole('spinbutton')
    await user.type(input, '3')
    await user.click(screen.getByRole('button', { name: '跳转' }))

    expect(handlers.onJump).toHaveBeenCalledWith(3)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    expect(input).toHaveValue(null)
  })

  it('输入页码后按 Enter：同样触发跳转并回到顶部', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    const input = screen.getByRole('spinbutton')
    await user.type(input, '1')
    await user.keyboard('{Enter}')

    expect(handlers.onJump).toHaveBeenCalledWith(1)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })

  it('跳转页码超出范围时收敛到最后一页', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    await user.type(screen.getByRole('spinbutton'), '99')
    await user.click(screen.getByRole('button', { name: '跳转' }))

    expect(handlers.onJump).toHaveBeenCalledWith(3)
  })

  it('输入非法内容时不跳转也不滚动', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { handlers, user } = setup(midPagination)

    // number 输入框会拦截非数字字符，value 保持为空
    await user.type(screen.getByRole('spinbutton'), 'abc')
    await user.click(screen.getByRole('button', { name: '跳转' }))

    expect(handlers.onJump).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('首页禁用上一页按钮', () => {
    setup({ ...midPagination, current: 1, has_prev: false, prev_num: 1 })

    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled()
  })

  it('末页禁用下一页按钮', () => {
    setup({ ...midPagination, current: 3, has_next: false, next_num: 3 })

    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled()
  })
})
