/**
 * WasmComicImage：单张在线阅读图片渲染槽。
 * - done：Canvas 绘制 ImageBitmap
 * - loading：脉冲占位
 * - idle：最小高度占位（尚未进入加载窗口）
 * - error：像素风错误提示
 */
import { memo, useEffect, useRef } from 'react'

import type { ImageEntry } from './useVirtualImages'

/** 像素风加载失败图标 */
function PixelBrokenIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="6" width="24" height="20" rx="1" fill="currentColor" opacity="0.12" />
      <rect x="4" y="6" width="24" height="2" fill="currentColor" opacity="0.35" />
      <rect x="4" y="24" width="24" height="2" fill="currentColor" opacity="0.35" />
      <rect x="4" y="6" width="2" height="20" fill="currentColor" opacity="0.35" />
      <rect x="26" y="6" width="2" height="20" fill="currentColor" opacity="0.35" />
      <path
        d="M15 6 L16 9 L14 11 L16 13 L14 15 L16 17 L15 20 L16 22 L15 26"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.5"
        strokeLinecap="square"
      />
      <rect x="24" y="3" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="28" y="3" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="26" y="5" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="24" y="7" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="28" y="7" width="2" height="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export const WasmComicImage = memo(function WasmComicImage({
  entry,
  index,
  slotIdx,
}: {
  entry: ImageEntry
  /** 全局图片序号（0 起），供 data-reader-index 定位当前页 */
  index: number
  /** 本页内局部索引，供滚动检测使用 */
  slotIdx: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 当 bitmap 就绪后绘制到 canvas
  useEffect(() => {
    if (entry.status !== 'done' || !entry.bitmap) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = entry.width
    canvas.height = entry.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(entry.bitmap, 0, 0)
  }, [entry])

  const { status } = entry

  return (
    <div
      data-vimg-idx={slotIdx}
      data-reader-index={index}
      className="relative mx-auto w-fit max-w-full"
      style={status === 'done' ? undefined : { minHeight: status === 'idle' ? '60vh' : 200 }}
    >
      {/* idle：轻量占位 */}
      {status === 'idle' && (
        <div className="flex h-[60vh] items-center justify-center">
          <span className="font-mono text-[10px] tracking-widest text-slate-300 dark:text-slate-700">
            {index + 1}
          </span>
        </div>
      )}

      {/* loading：脉冲动画 */}
      {status === 'loading' && (
        <div className="flex h-[200px] items-center justify-center">
          <div className="h-full w-full animate-pulse bg-slate-300/50 dark:bg-slate-800/50" />
        </div>
      )}

      {/* error：像素风提示 */}
      {status === 'error' && (
        <div className="flex h-[260px] flex-col items-center justify-center gap-3">
          <PixelBrokenIcon className="h-16 w-16 text-slate-400 dark:text-slate-500" />
          <p className="bg-gradient-to-r from-slate-400 via-slate-500 to-slate-400 bg-clip-text font-serif text-xs italic tracking-[0.3em] text-transparent dark:from-slate-500 dark:via-slate-400 dark:to-slate-500">
            第 {index + 1} 张 · 加载失败
          </p>
          <span className="font-mono text-[10px] tracking-widest text-slate-300 dark:text-slate-600">
            DECODE FAILED
          </span>
        </div>
      )}

      {/* done：GIF 等原始图片直接 <img> 渲染（保留动画）；普通图片 canvas 渲染 */}
      {status === 'done' && entry.rawUrl ? (
        <img
          src={entry.rawUrl}
          alt=""
          loading="lazy"
          className="block h-auto max-w-full"
        />
      ) : (
        <canvas
          ref={canvasRef}
          className="block h-auto max-w-full"
          style={status === 'done' ? undefined : { display: 'none' }}
        />
      )}
    </div>
  )
})
