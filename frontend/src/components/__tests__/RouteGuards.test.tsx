import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { emitForceLogout } from '../../lib/authEvents'
import { useAuthStore } from '../../store/authStore'
import { RequireAuth, RequireGuest } from '../RouteGuards'

/** 在指定路径渲染路由，/login 与 / 提供占位内容用于断言跳转结果 */
function renderRoute(initialPath: string, routePath: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={routePath} element={element} />
        <Route path="/login" element={<div>登录页</div>} />
        <Route path="/" element={<div>首页</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth 受保护路由', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ username: null, isAuthenticated: false })
  })

  it('未登录访问受保护路由：重定向到 /login', () => {
    renderRoute('/protected', '/protected', <RequireAuth><div>受保护内容</div></RequireAuth>)

    expect(screen.getByText('登录页')).toBeInTheDocument()
    expect(screen.queryByText('受保护内容')).toBeNull()
  })

  it('已登录：正常渲染受保护内容', () => {
    useAuthStore.setState({ username: 'alice', isAuthenticated: true })

    renderRoute('/protected', '/protected', <RequireAuth><div>受保护内容</div></RequireAuth>)

    expect(screen.getByText('受保护内容')).toBeInTheDocument()
    expect(screen.queryByText('登录页')).toBeNull()
  })

  it('登录过期（强制登出事件）后自动跳转到 /login', () => {
    useAuthStore.setState({ username: 'alice', isAuthenticated: true })

    renderRoute('/protected', '/protected', <RequireAuth><div>受保护内容</div></RequireAuth>)
    expect(screen.getByText('受保护内容')).toBeInTheDocument()

    act(() => emitForceLogout())

    expect(screen.getByText('登录页')).toBeInTheDocument()
    expect(screen.queryByText('受保护内容')).toBeNull()
  })
})

describe('RequireGuest 游客路由', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ username: null, isAuthenticated: false })
  })

  it('已登录访问登录页：重定向到首页', () => {
    useAuthStore.setState({ username: 'alice', isAuthenticated: true })

    renderRoute('/login', '/login', <RequireGuest><div>登录表单</div></RequireGuest>)

    expect(screen.getByText('首页')).toBeInTheDocument()
    expect(screen.queryByText('登录表单')).toBeNull()
  })

  it('未登录：正常渲染登录表单', () => {
    renderRoute('/login', '/login', <RequireGuest><div>登录表单</div></RequireGuest>)

    expect(screen.getByText('登录表单')).toBeInTheDocument()
  })
})
