/**
 * 堆叠照片相册卡片（本地图片库用，design.md L39）。
 * 复刻参考网站 PhotoWallClient 的三层堆叠：
 * - 底层 previewUrls[2]：rotate-6、灰度+模糊、opacity-60，悬停旋转外扩
 * - 中层 previewUrls[1]：-rotate-3、半灰度、opacity-80，悬停反向外扩
 * - 顶层 previewUrls[0]：全彩，悬停上浮放大 + 遮罩显示张数
 * 不足三张时用条件渲染（{previewUrls[2] && ...}）自然降级。
 * 传入 onClick 时卡片可点击（导航到本地阅读页），否则保持纯展示。
 */

interface StackedAlbumCardProps {
  name: string
  count: number
  /** 最多前 3 张预览图 URL。 */
  previewUrls: string[]
  /** 点击卡片回调（可选，传入后显示手型指针）。 */
  onClick?: () => void
}

/** 空相册占位图标。 */
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21z"
      />
    </svg>
  )
}

export default function StackedAlbumCard({ name, count, previewUrls, onClick }: StackedAlbumCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex flex-col items-center ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* 堆叠照片 */}
      <div className="relative mb-6 aspect-[4/3] w-[85%]">
        {/* 底层：第 3 张 */}
        {previewUrls[2] && (
          <div className="absolute inset-0 transform rotate-6 translate-x-4 translate-y-2 overflow-hidden rounded-[4px] border-[6px] border-white bg-slate-300 opacity-60 shadow-md transition-all duration-500 group-hover:translate-x-8 group-hover:rotate-12 dark:border-slate-200 dark:bg-slate-700">
            <img src={previewUrls[2]} alt="" loading="lazy" className="h-full w-full object-cover grayscale blur-[2px]" />
          </div>
        )}

        {/* 中层：第 2 张 */}
        {previewUrls[1] && (
          <div className="absolute inset-0 z-10 transform -rotate-3 -translate-x-2 -translate-y-1 overflow-hidden rounded-[4px] border-[6px] border-white bg-slate-200 opacity-80 shadow-lg transition-all duration-500 group-hover:-translate-x-6 group-hover:-rotate-6 dark:border-slate-200 dark:bg-slate-600">
            <img src={previewUrls[1]} alt="" loading="lazy" className="h-full w-full object-cover grayscale-[50%]" />
          </div>
        )}

        {/* 顶层：封面（第 1 张） */}
        <div className="absolute inset-0 z-20 transform overflow-hidden rounded-[4px] border-[6px] border-white bg-white shadow-2xl transition-all duration-500 group-hover:-translate-y-2 group-hover:scale-105 dark:border-slate-200 dark:bg-slate-200">
          {previewUrls[0] ? (
            <img
              src={previewUrls[0]}
              alt={name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-400/30 to-purple-400/30 text-slate-400 dark:text-slate-500">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          {/* 悬停遮罩：显示张数 */}
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-5 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <span className="translate-y-2 text-lg font-bold text-white drop-shadow-md transition-transform duration-500 group-hover:translate-y-0">
              {count} 张图片
            </span>
          </div>
        </div>
      </div>

      {/* 标题 */}
      <div className="w-full px-4 text-center">
        <div className="mb-1 flex items-center justify-center gap-2">
          <h2 className="truncate text-xl font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
            {name}
          </h2>
          <span className="shrink-0 rounded-sm bg-white/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 backdrop-blur-sm dark:bg-black/30 dark:text-slate-400">
            {count}P
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">本地图片相册</p>
      </div>
    </div>
  )
}
