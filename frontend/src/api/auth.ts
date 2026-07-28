import { apiClient } from './client'

/** 登录响应（simplejwt TokenObtainPair） */
export interface AuthTokens {
  access: string
  refresh: string
}

/** 注册响应（后端注册后自动签发 JWT） */
export interface RegisterResult extends AuthTokens {
  username: string
}

export interface RegisterPayload {
  username: string
  password: string
  password2: string
  secret_key: string
}

/** 登录：POST /api/auth/token/ */
export async function login(username: string, password: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/token/', { username, password })
  return data
}

/** 注册：POST /api/auth/register/ */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  const { data } = await apiClient.post<RegisterResult>('/auth/register/', payload)
  return data
}

/** 登出：POST /api/auth/logout/（拉黑 refresh token） */
export async function logout(refresh: string): Promise<void> {
  await apiClient.post('/auth/logout/', { refresh })
}
