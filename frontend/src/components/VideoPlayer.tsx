/**
 * 可复用视频播放器组件（B 站风格）。
 * Props 传入选集数据，支持网页全屏 / 系统全屏 / 倍速 / 音量 / 长按加速 / 选集分页。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { PlayerControls, PlayIcon } from './VideoPlayerControls'
import { formatTime } from './VideoPlayerUtils'

/* ─── 类型 ──────────────────────────────────────────── */
export interface VideoEpisode {
  name: string
  src: string
}

interface VideoPlayerProps {
  episodes: VideoEpisode[]
  /** 初始播放集数索引（默认 0） */
  initialEp?: number
}

/* ─── 常量 ──────────────────────────────────────────── */
const EP_PER_PAGE = 20
function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
    </svg>
  )
}

/* ─── 主组件 ─────────────────────────────────────────── */
export default function VideoPlayer({ episodes, initialEp = 0 }: VideoPlayerProps) {
  const totalEps = episodes.length
  const containerRef = useRef<HTMLDivElement>(null)
  const playerMountRef = useRef<HTMLDivElement>(null)
  const originalParentRef = useRef<HTMLElement | null>(null)
  const originalNextRef = useRef<Node | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)
  /* 画面横向拖动调进度手势状态 */
  const gestureRef = useRef({ startX: 0, baseTime: 0, active: false, moved: false })
  const suppressClickRef = useRef(false)

  /* 播放状态 */
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)

  /* 控制栏 */
  const [controlsVisible, setControlsVisible] = useState(true)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'play' | 'other'>('play')
  const [autoNext, setAutoNext] = useState(false)

  /* 全屏 */
  const [isWebFullscreen, setIsWebFullscreen] = useState(false)

  /* 长按倍速 */
  const [longPressSpeed, setLongPressSpeed] = useState(false)
  const [toast, setToast] = useState('')
  /* 拖动调进度指示：仅拖动过程中显示，松手立即消失 */
  const [dragTime, setDragTime] = useState<string | null>(null)

  /* 选集 */
  const [currentEp, setCurrentEp] = useState(initialEp)
  const [epPage, setEpPage] = useState(Math.floor(initialEp / EP_PER_PAGE) + 1)
  const epPageCount = Math.ceil(totalEps / EP_PER_PAGE)

  /* 进度条拖拽 */
  const [dragging, setDragging] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)

  /* ─── 控制栏自动隐藏 ─── */
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false)
        setSpeedMenuOpen(false)
        setSettingsOpen(false)
      }
    }, 3000)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [resetHideTimer])

  /* ─── 视频事件 ─── */
  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || dragging) return
    setCurrentTime(v.currentTime)
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
  }
  const handleEnded = () => {
    setPlaying(false)
    if (autoNext && currentEp < totalEps - 1) switchEpisode(currentEp + 1)
  }

  /* ─── 播放控制 ─── */
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
    resetHideTimer()
  }

  const switchEpisode = (idx: number) => {
    if (idx < 0 || idx >= totalEps) return
    setCurrentEp(idx)
    setEpPage(Math.floor(idx / EP_PER_PAGE) + 1)
    setCurrentTime(0)
    setBuffered(0)
    setPlaying(true)
    requestAnimationFrame(() => {
      const v = videoRef.current
      if (v) { v.load(); v.play().catch(() => {}) }
    })
  }

  /* ─── 进度条 ─── */
  const seekTo = (clientX: number) => {
    const bar = progressRef.current
    const v = videoRef.current
    if (!bar || !v) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const t = ratio * duration
    v.currentTime = t
    setCurrentTime(t)
  }
  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    seekTo(e.clientX)
    const onMove = (ev: MouseEvent) => seekTo(ev.clientX)
    const onUp = () => { setDragging(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const handleProgressHover = (e: React.MouseEvent) => {
    const bar = progressRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverTime(ratio * duration)
    setHoverX(e.clientX - rect.left)
  }

  /* ─── 音量 ─── */
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setVolume(val)
    setMuted(val === 0)
    if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0 }
  }
  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    const next = !muted
    setMuted(next)
    v.muted = next
  }

  /* ─── 倍速 ─── */
  const changeSpeed = (s: number) => {
    setSpeed(s)
    setSpeedMenuOpen(false)
    if (videoRef.current) videoRef.current.playbackRate = s
  }

  /* ─── 全屏 ─── */
  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen() }
    else el.requestFullscreen().catch(() => {})
  }
  const toggleWebFullscreen = () => setIsWebFullscreen((v) => !v)
  const togglePip = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch { /* ignore */ }
  }


  /* 网页全屏：锁定 body 滚动 */
  useEffect(() => {
    if (isWebFullscreen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isWebFullscreen])

  /* 网页全屏：把播放器容器整体移动到 body，而不是重挂载 <video>，保证播放不中断 */
  useEffect(() => {
    const el = playerMountRef.current
    if (!el) return
    if (isWebFullscreen) {
      originalParentRef.current = el.parentElement
      originalNextRef.current = el.nextSibling
      // 必须仍在 React 根容器 #root 内，否则合成事件（点击/鼠标移动等）全部失效；
      // 挂到应用顶层 div（z-index 9999 > 导航栏 z-50），且 .demo-bg 不产生 stacking context
      const appRoot = document.getElementById('root')?.firstElementChild
      if (appRoot && el.parentElement !== appRoot) {
        appRoot.append(el)
      }
    } else {
      const parent = originalParentRef.current
      if (parent && el.parentElement !== parent) {
        parent.insertBefore(el, originalNextRef.current)
      }
    }
  }, [isWebFullscreen])

  /* ─── 画面左右拖动调进度（触摸 + 鼠标） ─── */
  const beginGesture = (clientX: number) => {
    const v = videoRef.current
    if (v && duration) gestureRef.current = { startX: clientX, baseTime: v.currentTime, active: true, moved: false }
  }
  const moveGesture = (clientX: number) => {
    const g = gestureRef.current
    const v = videoRef.current
    if (!g.active || !v || !duration) return
    const dx = clientX - g.startX
    if (!g.moved && Math.abs(dx) < 12) return
    if (!g.moved) {
      g.moved = true
      // 横向拖动判定为调进度：取消长按倍速，避免手势互相干扰
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      setDragging(true)
    }
    const width = containerRef.current?.clientWidth || window.innerWidth
    const t = Math.max(0, Math.min(duration, g.baseTime + (dx / width) * duration))
    v.currentTime = t; setCurrentTime(t)
    setDragTime(`${formatTime(t)} / ${formatTime(duration)}`)
  }
  const endGesture = () => {
    const g = gestureRef.current
    if (g.active && g.moved) suppressClickRef.current = true // 拖动后抑制紧随的 click（避免误触播放/暂停）
    setDragTime(null); g.active = false; g.moved = false
  }
  const handleVideoClick = (e: React.MouseEvent) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; e.preventDefault(); return }
    togglePlay()
  }
  const handleVideoMouseDown = (e: React.MouseEvent) => {
    startLongPress()
    beginGesture(e.clientX)
    const onMove = (ev: MouseEvent) => moveGesture(ev.clientX)
    const onUp = () => {
      endLongPress(); endGesture(); setDragging(false)
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  /* ─── 长按倍速 ─── */
  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      const v = videoRef.current
      if (!v || v.paused) return // 暂停时不允许长按倍速
      setLongPressSpeed(true)
      v.playbackRate = 3
      setToast('3x 倍速播放中')
    }, 400)
  }
  const endLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (longPressSpeed) {
      setLongPressSpeed(false)
      if (videoRef.current) videoRef.current.playbackRate = speed
      setToast('')
      // 长按结束后浏览器会补发 click，吞掉它避免误触发播放/暂停
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 400)
    }
  }
  useEffect(() => {
    if (!toast || longPressSpeed) return
    const t = setTimeout(() => setToast(''), 1500)
    return () => clearTimeout(t)
  }, [toast, longPressSpeed])

  /* ─── 键盘快捷键 ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'Escape': if (isWebFullscreen) { e.preventDefault(); setIsWebFullscreen(false) } break
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': if (videoRef.current) videoRef.current.currentTime -= 5; break
        case 'ArrowRight': if (videoRef.current) videoRef.current.currentTime += 5; break
        case 'f': toggleFullscreen(); break
        case 'm': toggleMute(); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const epStart = (epPage - 1) * EP_PER_PAGE
  const epEnd = Math.min(epStart + EP_PER_PAGE, totalEps)

  /* ─── 播放器区域 ─── */
  const playerNode = (
    <div
      ref={containerRef}
      className={`group/player bg-black ${
        isWebFullscreen
          ? 'fixed inset-0 z-[9999]'
          : 'relative aspect-video overflow-hidden rounded-2xl shadow-2xl'
      }`}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (playing) setControlsVisible(false) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        src={episodes[currentEp]?.src}
        className="h-full w-full object-contain"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { const v = videoRef.current; if (v) setDuration(v.duration) }}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={handleVideoClick}
        onTouchStart={(e) => { startLongPress(); beginGesture(e.touches[0].clientX) }}
        onTouchMove={(e) => moveGesture(e.touches[0].clientX)}
        onTouchEnd={() => { endLongPress(); endGesture(); setDragging(false) }}
        onTouchCancel={() => { endLongPress(); endGesture(); setDragging(false) }}
        onMouseDown={handleVideoMouseDown}
        style={{ touchAction: 'pan-y' }}
      />

      {/* 拖动调进度指示（仅拖动时显示，视频顶部中央，松手立即消失） */}
      {dragTime && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full bg-black/75 px-5 py-2 font-mono text-sm font-bold text-white backdrop-blur-sm">{dragTime}</div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-[12%] z-50 -translate-x-1/2 rounded-full bg-black/75 px-5 py-2 text-sm font-bold text-white backdrop-blur-sm">{toast}</div>
      )}

      {/* 中央播放图标 */}
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${playing ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          <PlayIcon className="h-8 w-8 translate-x-[2px] text-white" />
        </div>
      </div>

      {/* ═══ 控制栏 ═══ */}
      <PlayerControls
        controlsVisible={controlsVisible}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        bufferedPct={bufferedPct}
        progress={progress}
        volume={volume}
        muted={muted}
        speed={speed}
        speedMenuOpen={speedMenuOpen}
        settingsOpen={settingsOpen}
        settingsTab={settingsTab}
        autoNext={autoNext}
        currentEp={currentEp}
        totalEps={totalEps}
        hoverTime={hoverTime}
        hoverX={hoverX}
        progressRef={progressRef}
        onPrev={() => switchEpisode(currentEp - 1)}
        onNext={() => switchEpisode(currentEp + 1)}
        onTogglePlay={togglePlay}
        onProgressMouseDown={handleProgressMouseDown}
        onProgressHover={handleProgressHover}
        onProgressLeave={() => setHoverTime(null)}
        onVolumeChange={handleVolumeChange}
        onToggleMute={toggleMute}
        onSpeedChange={changeSpeed}
        onSpeedMenuToggle={() => { setSpeedMenuOpen((v) => !v); setSettingsOpen(false) }}
        onSettingsToggle={() => { setSettingsOpen((v) => !v); setSpeedMenuOpen(false) }}
        onSettingsTab={setSettingsTab}
        onAutoNext={setAutoNext}
        onPip={togglePip}
        onWebFullscreen={toggleWebFullscreen}
        onFullscreen={toggleFullscreen}
      />
    </div>
  )

  return (
    <div>
      {/* 播放器容器：网页全屏时整体移动（见上方 useEffect） */}
      <div ref={playerMountRef}>{playerNode}</div>

      {/* ═══ 播放器下方：信息 + 操作按钮 ═══ */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{episodes[currentEp]?.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">共 {totalEps} 集 · 当前第 {currentEp + 1} 集</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {currentEp > 0 && (
            <button type="button" onClick={() => switchEpisode(currentEp - 1)} className="glass-btn glass-btn-sm">
              <span className="glass-btn-overlay" />
              <span className="glass-btn-text">上一集</span>
            </button>
          )}
          {currentEp < totalEps - 1 && (
            <button type="button" onClick={() => switchEpisode(currentEp + 1)} className="glass-btn glass-btn-sm">
              <span className="glass-btn-overlay" />
              <span className="glass-btn-text">下一集</span>
            </button>
          )}
          <a href={episodes[currentEp]?.src} download className="glass-btn glass-btn-sm">
            <span className="glass-btn-overlay" />
            <span className="glass-btn-text flex items-center gap-1">
              <DownloadIcon className="h-3.5 w-3.5" /> 下载
            </span>
          </a>
        </div>
      </div>

      {/* ═══ 选集列表 ═══ */}
      <div className="mt-6 rounded-2xl border border-white/40 bg-white/40 p-4 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-800/50 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">全部选集 ({totalEps})</h3>
          <span className="font-mono text-xs text-slate-400">{epPage} / {epPageCount}</span>
        </div>

        <div className="space-y-1">
          {episodes.slice(epStart, epEnd).map((ep, i) => {
            const idx = epStart + i
            const active = idx === currentEp
            return (
              <div key={idx} className="flex items-center gap-1">
                <a
                  href={ep.src}
                  download
                  title={`下载 ${ep.name}`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                    active
                      ? 'text-white/70 hover:bg-white/20 hover:text-white'
                      : 'text-slate-400 hover:bg-white/60 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-slate-700/40 dark:hover:text-indigo-400'
                  }`}
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => switchEpisode(idx)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                    active
                      ? 'border border-white/25 bg-[#5A67FF] text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-200/60 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm font-medium ${active ? 'text-white' : ''}`}>
                    {ep.name}
                  </span>
                  {active && <PlayIcon className="h-4 w-4 shrink-0 text-white/80" />}
                </button>
              </div>
            )
          })}
        </div>

        {/* 分页 */}
        {epPageCount > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button type="button" onClick={() => setEpPage((p) => Math.max(1, p - 1))} disabled={epPage <= 1}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-white/60 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700/50"
            >上一页</button>
            {Array.from({ length: Math.min(7, epPageCount) }, (_, i) => {
              let p: number
              if (epPageCount <= 7) p = i + 1
              else if (epPage <= 4) p = i + 1
              else if (epPage >= epPageCount - 3) p = epPageCount - 6 + i
              else p = epPage - 3 + i
              return (
                <button key={p} type="button" onClick={() => setEpPage(p)}
                  className={`h-7 w-7 rounded-lg text-xs font-bold ${p === epPage ? 'bg-[#5A67FF] text-white shadow-md' : 'text-slate-500 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-700/50'}`}
                >{p}</button>
              )
            })}
            <button type="button" onClick={() => setEpPage((p) => Math.min(epPageCount, p + 1))} disabled={epPage >= epPageCount}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-white/60 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700/50"
            >下一页</button>
          </div>
        )}
      </div>
    </div>
  )
}
