/**
 * 强制登出事件：登录过期（refresh 失效 / 凭证被清空）时由 axios 拦截器发出。
 * 独立模块以避免循环依赖（client.ts 与 authStore.ts 都只依赖本模块）。
 */
type Listener = () => void

const listeners = new Set<Listener>()

/** 订阅强制登出事件，返回取消订阅函数 */
export function onForceLogout(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 发出强制登出事件（本地凭证已被清空后调用） */
export function emitForceLogout(): void {
  listeners.forEach((listener) => listener())
}
