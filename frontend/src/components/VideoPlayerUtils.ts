/** 视频播放器共享常量与工具函数（与组件文件分离，避免 fast-refresh 告警）。 */

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
