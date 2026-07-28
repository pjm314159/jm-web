import { useNavigate } from 'react-router-dom'

/**
 * 404 页面：访问不存在的路由时展示。
 * 液态玻璃风格，适配昼夜模式。
 */
export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
      {/* 主卡片 */}
      <div className="flex flex-col items-center gap-6 rounded-3xl border border-white/40 bg-white/40 px-12 py-14 text-center shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/50">
        {/* 404 数字 */}
        <div className="relative">
          <span className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-8xl font-black tracking-tighter text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
            404
          </span>
          {/* 装饰光晕 */}
          <div className="absolute -inset-4 -z-10 rounded-full bg-indigo-500/10 blur-2xl dark:bg-indigo-400/10" />
        </div>

        {/* 提示文案 */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">页面走丢了</h1>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            你访问的地址不存在，可能已被移除或链接有误。
          </p>
        </div>

        {/* 当前路径 */}
        <code className="rounded-xl border border-slate-200/60 bg-slate-100/60 px-4 py-2 font-mono text-xs text-slate-500 dark:border-slate-700/40 dark:bg-slate-900/40 dark:text-slate-400">
          {window.location.pathname}
        </code>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-2xl border border-white/40 bg-white/50 px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            返回上一页
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-2xl border border-indigo-200/50 bg-indigo-50/60 px-5 py-2.5 text-sm font-bold text-indigo-600 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300/60 hover:shadow-lg active:scale-95 dark:border-indigo-500/20 dark:bg-indigo-950/30 dark:text-indigo-400"
          >
            回到首页
          </button>
        </div>
      </div>
    </div>
  )
}
