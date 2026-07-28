/**
 * 可复用视频播放器组件（B 站风格）。
 * Props 传入选集数据，支持网页全屏 / 系统全屏 / 倍速 / 音量 / 长按加速 / 选集分页。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/* ─── 工具函数 ──────────────────────────────────────── */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/* ─── SVG 图标（圆润设计） ───────────────────────────── */
function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.5 7.5v9c0 .8.87 1.3 1.56.88l7.2-4.5a1.04 1.04 0 000-1.76l-7.2-4.5c-.69-.42-1.56.08-1.56.88z" />
    </svg>
  )
}
function PauseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="5" width="3.5" height="14" rx="1.75" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.75" />
    </svg>
  )
}
function PrevIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5.5" y="6" width="2.5" height="12" rx="1.25" />
      <path d="M18.5 7.8v8.4c0 .8-.9 1.32-1.6.9l-6.72-4.2a1.06 1.06 0 010-1.8l6.72-4.2c.7-.42 1.6.1 1.6.9z" />
    </svg>
  )
}
function NextIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="16" y="6" width="2.5" height="12" rx="1.25" />
      <path d="M5.5 7.8v8.4c0 .8.9 1.32 1.6.9l6.72-4.2a1.06 1.06 0 000-1.8L7.1 6.9c-.7-.42-1.6.1-1.6.9z" />
    </svg>
  )
}
function VolumeIcon({ className = '', muted = false }: { className?: string; muted?: boolean }) {
  return muted ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5L7.5 8.5H4.75A1.25 1.25 0 003.5 9.75v4.5c0 .69.56 1.25 1.25 1.25H7.5L12 19.5V4.5z" />
      <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" d="M15.5 9.5l5 5m0-5l-5 5" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5L7.5 8.5H4.75A1.25 1.25 0 003.5 9.75v4.5c0 .69.56 1.25 1.25 1.25H7.5L12 19.5V4.5z" />
      <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" d="M15.5 9a4.5 4.5 0 010 6" />
      <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" d="M18 6.5a8.5 8.5 0 010 11" />
    </svg>
  )
}
function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function WebFullscreenIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5.5A1.5 1.5 0 015.5 4H9m6 0h3.5A1.5 1.5 0 0120 5.5V9m0 6v3.5a1.5 1.5 0 01-1.5 1.5H15m-6 0H5.5A1.5 1.5 0 014 18.5V15" />
    </svg>
  )
}
function FullscreenIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
    </svg>
  )
}
function PipIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <rect x="12" y="11" width="6.5" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(null)

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

  /* ─── 长按倍速 ─── */
  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setLongPressSpeed(true)
      if (videoRef.current) videoRef.current.playbackRate = 3
      setToast('3x 倍速播放中')
    }, 400)
  }
  const endLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (longPressSpeed) {
      setLongPressSpeed(false)
      if (videoRef.current) videoRef.current.playbackRate = speed
      setToast('')
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
        onClick={togglePlay}
        onTouchStart={startLongPress}
        onTouchEnd={endLongPress}
        onTouchCancel={endLongPress}
        onMouseDown={startLongPress}
        onMouseUp={endLongPress}
      />

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-[12%] z-50 -translate-x-1/2 rounded-full bg-black/75 px-5 py-2 text-sm font-bold text-white backdrop-blur-sm">
          {toast}
        </div>
      )}

      {/* 中央播放图标 */}
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${playing ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          <PlayIcon className="h-8 w-8 translate-x-[2px] text-white" />
        </div>
      </div>

      {/* ═══ 控制栏 ═══ */}
      <div className={`absolute inset-x-0 bottom-0 z-40 transition-all duration-300 ${controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="relative px-3 pb-2 pt-8 sm:px-4">
          {/* 进度条 */}
          <div
            ref={progressRef}
            className="group/bar relative mb-2 h-[3px] cursor-pointer rounded-full bg-white/20 transition-all hover:h-[6px]"
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#5A67FF]" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5A67FF] opacity-0 shadow-md transition-opacity group-hover/bar:opacity-100" style={{ left: `${progress}%` }} />
            {hoverTime !== null && (
              <div className="absolute -top-8 -translate-x-1/2 rounded-md bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white" style={{ left: hoverX }}>
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* 按钮行 */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {currentEp > 0 && (
              <button type="button" onClick={() => switchEpisode(currentEp - 1)} className="ctrl-btn">
                <PrevIcon className="h-6 w-6" />
              </button>
            )}
            <button type="button" onClick={togglePlay} className="ctrl-btn">
              {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
            </button>
            {currentEp < totalEps - 1 && (
              <button type="button" onClick={() => switchEpisode(currentEp + 1)} className="ctrl-btn">
                <NextIcon className="h-6 w-6" />
              </button>
            )}

            <span className="ml-1 font-mono text-xs text-white/90">
              {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* 音量 */}
            <div className="group/vol relative flex items-center">
              <button type="button" onClick={toggleMute} className="ctrl-btn">
                <VolumeIcon className="h-5 w-5" muted={muted || volume === 0} />
              </button>
              <div className="pointer-events-none absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-xl bg-black/80 p-2 pb-3 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover/vol:pointer-events-auto group-hover/vol:opacity-100">
                <span className="text-[10px] font-bold text-white/70">{Math.round((muted ? 0 : volume) * 100)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="volume-vertical"
                  style={{ background: `linear-gradient(to top, #5A67FF ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) ${(muted ? 0 : volume) * 100}%)` }}
                />
              </div>
            </div>

            {/* 倍速 */}
            <div className="relative">
              <button type="button" onClick={() => { setSpeedMenuOpen((v) => !v); setSettingsOpen(false) }} className="ctrl-btn">
                <span className="text-xs font-bold">{speed}x</span>
              </button>
              {speedMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-24 rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-xl">
                  {[...SPEED_OPTIONS].reverse().map((s) => (
                    <button key={s} type="button" onClick={() => changeSpeed(s)}
                      className={`block w-full px-3 py-1.5 text-center text-xs font-semibold transition-colors ${speed === s ? 'bg-[#5A67FF]/20 text-[#5A67FF]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                    >{s}x</button>
                  ))}
                </div>
              )}
            </div>

            {/* 设置 */}
            <div className="relative">
              <button type="button" onClick={() => { setSettingsOpen((v) => !v); setSpeedMenuOpen(false) }} className="ctrl-btn">
                <SettingsIcon className={`h-5 w-5 transition-transform duration-300 ${settingsOpen ? 'rotate-45' : ''}`} />
              </button>
              {settingsOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-56 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
                  <div className="relative mb-3 flex rounded-full bg-white/10 p-0.5">
                    <div
                      className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-white/90 shadow-sm transition-transform duration-300 ease-out"
                      style={{ transform: settingsTab === 'play' ? 'translateX(2px)' : 'translateX(calc(100% + 2px))' }}
                    />
                    <button type="button" onClick={() => setSettingsTab('play')}
                      className={`relative z-10 flex-1 rounded-full py-1.5 text-center text-xs font-bold transition-colors duration-300 ${settingsTab === 'play' ? 'text-slate-900' : 'text-white/60'}`}
                    >播放设置</button>
                    <button type="button" onClick={() => setSettingsTab('other')}
                      className={`relative z-10 flex-1 rounded-full py-1.5 text-center text-xs font-bold transition-colors duration-300 ${settingsTab === 'other' ? 'text-slate-900' : 'text-white/60'}`}
                    >其他</button>
                  </div>
                  {settingsTab === 'play' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/80">播完自动下一集</span>
                        <button
                          type="button"
                          onClick={() => setAutoNext((v) => !v)}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${autoNext ? 'bg-[#5A67FF]' : 'bg-white/20'}`}
                        >
                          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${autoNext ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <p className="text-[10px] leading-relaxed text-white/40">
                        {autoNext ? '播放结束后自动切换下一集' : '播放结束后暂停（默认）'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs text-white/60">
                      <p>长按画面：3x 倍速</p>
                      <p>快捷键：空格/K 播放，F 全屏</p>
                      <p>← → 快退/快进 5s</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button type="button" onClick={togglePip} className="ctrl-btn hidden sm:flex"><PipIcon className="h-5 w-5" /></button>
            <button type="button" onClick={toggleWebFullscreen} className="ctrl-btn"><WebFullscreenIcon className="h-5 w-5" /></button>
            <button type="button" onClick={toggleFullscreen} className="ctrl-btn"><FullscreenIcon className="h-5 w-5" /></button>
          </div>
        </div>
      </div>
    </div>
  )

  /* 网页全屏：Portal 到 body */
  if (isWebFullscreen) {
    return createPortal(playerNode, document.body)
  }

  return (
    <div>
      {playerNode}

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
