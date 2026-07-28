/**
 * 阅读页图片渲染组件（正式版）：
 * - JmScrambledImage：在线阅读器 Canvas 反混淆（dev-plan 3.4，算法与旧模板 renderJmImage 一致）
 * - LocalComicImage：本地阅读器普通图片（原生懒加载）
 * 两者均无缝拼接（无圆角无间距），与旧代码同样全量挂载、浏览器自行调度加载。
 */
import { memo, useCallback, useRef, useState } from 'react'

/** 像素风加载失败图标：可爱破碎图片 + 小叉号 */
function PixelBrokenIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* 图片框体（像素风） */}
      <rect x="4" y="6" width="24" height="20" rx="1" fill="currentColor" opacity="0.12" />
      <rect x="4" y="6" width="24" height="2" fill="currentColor" opacity="0.35" />
      <rect x="4" y="24" width="24" height="2" fill="currentColor" opacity="0.35" />
      <rect x="4" y="6" width="2" height="20" fill="currentColor" opacity="0.35" />
      <rect x="26" y="6" width="2" height="20" fill="currentColor" opacity="0.35" />
      {/* 山峰（图片内容示意） */}
      <rect x="8" y="18" width="2" height="4" fill="currentColor" opacity="0.25" />
      <rect x="10" y="16" width="2" height="6" fill="currentColor" opacity="0.25" />
      <rect x="12" y="14" width="2" height="8" fill="currentColor" opacity="0.25" />
      <rect x="14" y="16" width="2" height="6" fill="currentColor" opacity="0.25" />
      <rect x="16" y="18" width="2" height="4" fill="currentColor" opacity="0.25" />
      {/* 小太阳 */}
      <rect x="21" y="10" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.3" />
      {/* 裂缝（锯齿状） */}
      <path
        d="M15 6 L16 9 L14 11 L16 13 L14 15 L16 17 L15 20 L16 22 L15 26"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.5"
        strokeLinecap="square"
      />
      {/* 右上角小叉号 */}
      <rect x="24" y="3" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="28" y="3" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="26" y="5" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="24" y="7" width="2" height="2" fill="currentColor" opacity="0.6" />
      <rect x="28" y="7" width="2" height="2" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

/** 加载失败占位：像素风图标 + 艺术字 */
function ImageErrorPlaceholder({ index }: { index: number }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-3">
      <PixelBrokenIcon className="h-16 w-16 text-slate-400 dark:text-slate-500" />
      <p className="bg-gradient-to-r from-slate-400 via-slate-500 to-slate-400 bg-clip-text font-serif text-xs italic tracking-[0.3em] text-transparent dark:from-slate-500 dark:via-slate-400 dark:to-slate-500">
        第 {index + 1} 张 · 加载失败
      </p>
      <span className="font-mono text-[10px] tracking-widest text-slate-300 dark:text-slate-600">
        IMAGE NOT FOUND
      </span>
    </div>
  )
}

/**
 * 反混淆重绘（移植旧模板 renderJmImage，逻辑不变）：
 * 图片被纵向切成 num 片并乱序，重绘时按片搬运回正确位置；num<=1 时原样绘制。
 */
function drawDescrambled(img: HTMLImageElement, canvas: HTMLCanvasElement, num: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = img.naturalWidth
  const h = img.naturalHeight
  canvas.width = w
  canvas.height = h

  if (num <= 1) {
    ctx.drawImage(img, 0, 0)
    return
  }

  const over = h % num
  for (let i = 0; i < num; i++) {
    let move = Math.floor(h / num)
    const ySrc = h - move * (i + 1) - over
    let yDst = move * i
    if (i === 0) move += over
    else yDst += over
    ctx.drawImage(img, 0, ySrc, w, move, 0, yDst, w, move)
  }
}

/** 在线漫画页：隐藏 img 加载远端原图 → onLoad 后 Canvas 反混淆重绘。 */
export const JmScrambledImage = memo(function JmScrambledImage({
  url,
  num,
  index,
}: {
  url: string
  num: number
  /** 全局图片序号（0 起），供 data-reader-index 定位当前页 */
  index: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      drawDescrambled(e.currentTarget, canvas, num)
      setStatus('done')
    },
    [num],
  )

  return (
    <div
      data-reader-index={index}
      className="relative mx-auto w-fit"
      style={status === 'done' ? undefined : { minHeight: 200 }}
    >
      {/* 源图：仅用于取像素，不展示（跨域取像素须 CORS + 不带 referrer） */}
      <img
        src={url}
        alt=""
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        className="hidden"
        onLoad={handleLoad}
        onError={() => setStatus('error')}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-slate-300/50 dark:bg-slate-800/50" />
      )}
      {status === 'error' && <ImageErrorPlaceholder index={index} />}
      <canvas ref={canvasRef} className="block" />
    </div>
  )
})

/** 本地漫画页：直接渲染 /media/ 图片，原生懒加载。 */
export const LocalComicImage = memo(function LocalComicImage({
  url,
  index,
}: {
  url: string
  /** 全局图片序号（0 起），供 data-reader-index 定位当前页 */
  index: number
}) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  return (
    <div
      data-reader-index={index}
      className="relative mx-auto w-fit"
      style={status === 'done' ? undefined : { minHeight: 200 }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-slate-300/50 dark:bg-slate-800/50" />
      )}
      {status === 'error' && <ImageErrorPlaceholder index={index} />}
      <img
        src={url}
        alt={`第 ${index + 1} 张`}
        loading="lazy"
        className="block"
        onLoad={() => setStatus('done')}
        onError={() => setStatus('error')}
      />
    </div>
  )
})
