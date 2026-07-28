import { isAxiosError } from 'axios'

/** simplejwt / DRF 默认英文消息 → 中文提示 */
const DETAIL_MESSAGE_MAP: Record<string, string> = {
  'No active account found with the given credentials': '用户名或密码错误',
  'Given token not valid for this token type': '登录已过期，请重新登录',
  'Token is blacklisted': '登录已失效，请重新登录',
}

/**
 * 从 axios 错误中提取可读的中文提示。
 * 兼容 simplejwt 的 {detail} 与 DRF 的字段错误 {field: [...]} / non_field_errors。
 */
export function extractErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (!isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback
  }

  const data = error.response?.data as Record<string, unknown> | undefined
  if (!data) return fallback

  if (typeof data.detail === 'string') {
    return DETAIL_MESSAGE_MAP[data.detail] ?? data.detail
  }
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return String(data.non_field_errors[0])
  }

  // 取第一个字段错误
  for (const [key, value] of Object.entries(data)) {
    if (key === 'detail') continue
    if (Array.isArray(value) && value.length) return String(value[0])
    if (typeof value === 'string') return value
  }

  return fallback
}
