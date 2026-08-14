/**
 * 在线阅读器性能配置（通过 .env 的 VITE_READER_* 变量覆盖）。
 */
function intEnv(key: string, fallback: number): number {
  const v = import.meta.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
}

export const READER_CONFIG = {
  /** 一次性最大加载图片数 */
  MAX_LOADED: intEnv('VITE_READER_MAX_LOADED', 50),
  /** 预加载向下屏数 */
  PREFETCH_BELOW: intEnv('VITE_READER_PREFETCH_BELOW', 8),
  /** 预加载向上屏数 */
  PREFETCH_ABOVE: intEnv('VITE_READER_PREFETCH_ABOVE', 2),
  /** WASM 解码窗口：向上屏数 */
  DECODE_ABOVE: intEnv('VITE_READER_DECODE_ABOVE', 2),
  /** WASM 解码窗口：向下屏数 */
  DECODE_BELOW: intEnv('VITE_READER_DECODE_BELOW', 2),
  /** LRU 缓存容量 */
  CACHE_SIZE: intEnv('VITE_READER_CACHE_SIZE', 60),
  /** 阅读器图片/章节数据 staleTime (ms) */
  READER_STALE_TIME: intEnv('VITE_READER_STALE_TIME', 300_000),
  /** 下载进度轮询间隔 (ms) */
  CRAWL_POLL_INTERVAL: intEnv('VITE_CRAWL_POLL_INTERVAL', 2000),
} as const
