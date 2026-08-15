/**
 * 视频播放器底部控制栏（从 VideoPlayer 中拆出，控制主组件/文件体积）。
 */

import { SPEED_OPTIONS, formatTime } from './VideoPlayerUtils'

/* ─── SVG 图标（圆润设计） ───────────────────────────── */
export function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.5 7.5v9c0 .8.87 1.3 1.56.88l7.2-4.5a1.04 1.04 0 000-1.76l-7.2-4.5c-.69-.42-1.56.08-1.56.88z" />
    </svg>
  )
}
export function PauseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="5" width="3.5" height="14" rx="1.75" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.75" />
    </svg>
  )
}
export function PrevIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5.5" y="6" width="2.5" height="12" rx="1.25" />
      <path d="M18.5 7.8v8.4c0 .8-.9 1.32-1.6.9l-6.72-4.2a1.06 1.06 0 010-1.8l6.72-4.2c.7-.42 1.6.1 1.6.9z" />
    </svg>
  )
}
export function NextIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="16" y="6" width="2.5" height="12" rx="1.25" />
      <path d="M5.5 7.8v8.4c0 .8.9 1.32 1.6.9l6.72-4.2a1.06 1.06 0 000-1.8L7.1 6.9c-.7-.42-1.6.1-1.6.9z" />
    </svg>
  )
}
export function VolumeIcon({
  className = '',
  muted = false,
}: {
  className?: string
  muted?: boolean
}) {
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
export function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
export function PipIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <rect x="12" y="11" width="6.5" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
export function WebFullscreenIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V5.5A1.5 1.5 0 015.5 4H9m6 0h3.5A1.5 1.5 0 0120 5.5V9m0 6v3.5a1.5 1.5 0 01-1.5 1.5H15m-6 0H5.5A1.5 1.5 0 014 18.5V15" />
    </svg>
  )
}
export function FullscreenIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
    </svg>
  )
}

/* ─── 底部控制栏 ────────────────────────────────────── */
interface PlayerControlsProps {
  controlsVisible: boolean
  playing: boolean
  currentTime: number
  duration: number
  bufferedPct: number
  progress: number
  volume: number
  muted: boolean
  speed: number
  speedMenuOpen: boolean
  settingsOpen: boolean
  settingsTab: 'play' | 'other'
  autoNext: boolean
  currentEp: number
  totalEps: number
  hoverTime: number | null
  hoverX: number
  progressRef: React.RefObject<HTMLDivElement | null>
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
  onProgressMouseDown: (e: React.MouseEvent) => void
  onProgressHover: (e: React.MouseEvent) => void
  onProgressLeave: () => void
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onToggleMute: () => void
  onSpeedChange: (s: number) => void
  onSpeedMenuToggle: () => void
  onSettingsToggle: () => void
  onSettingsTab: (tab: 'play' | 'other') => void
  onAutoNext: (v: boolean) => void
  onPip: () => void
  onWebFullscreen: () => void
  onFullscreen: () => void
}

export function PlayerControls(props: PlayerControlsProps) {
  const {
    controlsVisible,
    playing,
    currentTime,
    duration,
    bufferedPct,
    progress,
    volume,
    muted,
    speed,
    speedMenuOpen,
    settingsOpen,
    settingsTab,
    autoNext,
    currentEp,
    totalEps,
    hoverTime,
    hoverX,
    progressRef,
    onPrev,
    onNext,
    onTogglePlay,
    onProgressMouseDown,
    onProgressHover,
    onProgressLeave,
    onVolumeChange,
    onToggleMute,
    onSpeedChange,
    onSpeedMenuToggle,
    onSettingsToggle,
    onSettingsTab,
    onAutoNext,
    onPip,
    onWebFullscreen,
    onFullscreen,
  } = props

  return (
    <div className={`absolute inset-x-0 bottom-0 z-40 transition-all duration-300 ${controlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className="relative px-3 pb-2 pt-8 sm:px-4">
        <div
          ref={progressRef}
          className="group/bar relative mb-2 h-[3px] cursor-pointer rounded-full bg-white/20 transition-all hover:h-[6px]"
          onMouseDown={onProgressMouseDown}
          onMouseMove={onProgressHover}
          onMouseLeave={onProgressLeave}
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

        <div className="flex items-center gap-1 sm:gap-1.5">
          {currentEp > 0 && (
            <button type="button" onClick={onPrev} className="ctrl-btn">
              <PrevIcon className="h-6 w-6" />
            </button>
          )}
          <button type="button" onClick={onTogglePlay} className="ctrl-btn">
            {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          {currentEp < totalEps - 1 && (
            <button type="button" onClick={onNext} className="ctrl-btn">
              <NextIcon className="h-6 w-6" />
            </button>
          )}

          <span className="ml-1 font-mono text-xs text-white/90">
            {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <div className="group/vol relative flex items-center">
            <button type="button" onClick={onToggleMute} className="ctrl-btn">
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
                onChange={onVolumeChange}
                className="volume-vertical"
                style={{ background: `linear-gradient(to top, #5A67FF ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.25) ${(muted ? 0 : volume) * 100}%)` }}
              />
            </div>
          </div>

          <div className="relative">
            <button type="button" onClick={onSpeedMenuToggle} className="ctrl-btn">
              <span className="text-xs font-bold">{speed}x</span>
            </button>
            {speedMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-24 rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-xl">
                {[...SPEED_OPTIONS].reverse().map((s) => (
                  <button key={s} type="button" onClick={() => onSpeedChange(s)}
                    className={`block w-full px-3 py-1.5 text-center text-xs font-semibold transition-colors ${speed === s ? 'bg-[#5A67FF]/20 text-[#5A67FF]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >{s}x</button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button type="button" onClick={onSettingsToggle} className="ctrl-btn">
              <SettingsIcon className={`h-5 w-5 transition-transform duration-300 ${settingsOpen ? 'rotate-45' : ''}`} />
            </button>
            {settingsOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl">
                <div className="relative mb-3 flex rounded-full bg-white/10 p-0.5">
                  <div
                    className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-white/90 shadow-sm transition-transform duration-300 ease-out"
                    style={{ transform: settingsTab === 'play' ? 'translateX(2px)' : 'translateX(calc(100% + 2px))' }}
                  />
                  <button type="button" onClick={() => onSettingsTab('play')}
                    className={`relative z-10 flex-1 rounded-full py-1.5 text-center text-xs font-bold transition-colors duration-300 ${settingsTab === 'play' ? 'text-slate-900' : 'text-white/60'}`}
                  >播放设置</button>
                  <button type="button" onClick={() => onSettingsTab('other')}
                    className={`relative z-10 flex-1 rounded-full py-1.5 text-center text-xs font-bold transition-colors duration-300 ${settingsTab === 'other' ? 'text-slate-900' : 'text-white/60'}`}
                  >其他</button>
                </div>
                {settingsTab === 'play' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/80">播完自动下一集</span>
                      <button
                        type="button"
                        onClick={() => onAutoNext(!autoNext)}
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

          <button type="button" onClick={onPip} className="ctrl-btn hidden sm:flex"><PipIcon className="h-5 w-5" /></button>
          <button type="button" onClick={onWebFullscreen} className="ctrl-btn"><WebFullscreenIcon className="h-5 w-5" /></button>
          <button type="button" onClick={onFullscreen} className="ctrl-btn"><FullscreenIcon className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  )
}
