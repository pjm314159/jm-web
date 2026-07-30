/**
 * 本子卡片（搜索页 / 藏书阁共用，毛玻璃风格，适配昼夜）。
 * - downloaded=true：左上角绿色「已下载」徽章（搜索结果）
 * - downloaded=false/省略：左上角显示「ID: xxx」（藏书阁恒为此）
 */
interface AlbumCardProps {
  jmId: string
  name: string
  author: string
  tags: string[]
  coverUrl: string | null
  /** 右下附加信息（搜索为更新时间，藏书阁为入库日期）。 */
  meta?: string
  /** 为 true 显示「已下载」徽章，否则显示 JM ID。 */
  downloaded?: boolean
  /** 详情页链接，支持右键“在新标签页打开”。 */
  href?: string
  onTagClick?: (tag: string) => void
  onAuthorClick?: (author: string) => void
}

export default function AlbumCard({
  jmId,
  name,
  author,
  tags,
  coverUrl,
  meta,
  downloaded = false,
  href,
  onTagClick,
  onAuthorClick,
}: AlbumCardProps) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-slate-800/50">
      {/* 封面 */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-slate-200/60 dark:bg-slate-700/50"
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-400/30 to-purple-400/30 text-3xl font-black text-white/70">
            {name.charAt(0) || '?'}
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm ${
            downloaded ? 'bg-emerald-500/85' : 'bg-black/55'
          }`}
        >
          {downloaded ? '已下载' : `ID: ${jmId}`}
        </span>
      </a>

      {/* 信息区 */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 cursor-pointer text-sm font-bold leading-snug text-slate-800 transition-colors hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
        >
          {name}
        </a>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => onAuthorClick?.(author)}
            className="truncate font-medium transition-colors hover:text-indigo-500"
          >
            {author || '未知'}
          </button>
          {meta && <span className="shrink-0 font-mono text-[10px]">{meta}</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {tags.slice(0, 4).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick?.(tag)}
                className="rounded-md bg-slate-100/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-indigo-100 hover:text-indigo-600 dark:bg-slate-700/60 dark:text-slate-400 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-300"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
