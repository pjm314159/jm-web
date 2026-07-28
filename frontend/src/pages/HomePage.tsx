import { Link } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

/**
 * 首页：
 * - 欢迎横幅（展示登录用户）
 * - 四个功能入口卡片（链接到对应路由，功能页暂为占位）
 */

type Accent = {
  /** 标签文字颜色 */
  text: string
  /** 标签前的小圆点 */
  dot: string
  /** 悬停光晕 */
  glow: string
}

const ACCENTS: Record<string, Accent> = {
  indigo: {
    text: 'text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-500',
    glow: 'bg-indigo-400',
  },
  purple: {
    text: 'text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
    glow: 'bg-purple-400',
  },
  sky: {
    text: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    glow: 'bg-sky-400',
  },
  pink: {
    text: 'text-pink-600 dark:text-pink-400',
    dot: 'bg-pink-500',
    glow: 'bg-pink-400',
  },
}

interface HomeCardProps {
  to: string
  title: string
  desc: string
  label: string
  image: string
  accent: Accent
  className?: string
}

function HomeCard({ to, title, desc, label, image, accent, className = '' }: HomeCardProps) {
  return (
    <Link
      to={to}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/40 shadow-xl backdrop-blur-md transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl dark:border-white/10 dark:bg-slate-800/50 ${className}`}
    >
      {/* 封面图 */}
      <div className="relative h-44 overflow-hidden sm:h-52">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-white/10 to-transparent dark:from-slate-800/80 dark:via-slate-800/10" />
        <div
          className={`absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-50 ${accent.glow}`}
        />
      </div>

      {/* 内容区 */}
      <div className="relative z-10 flex flex-1 flex-col p-6 sm:p-7">
        <div
          className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${accent.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          {label}
        </div>
        <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{title}</h3>
        <p className="flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
          {desc}
        </p>
        <div className={`mt-5 flex items-center gap-1.5 text-sm font-semibold ${accent.text}`}>
          进入
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const username = useAuthStore((s) => s.username)

  return (
    <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 pb-12 sm:px-6 lg:px-10">
      <main className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 欢迎横幅（占满整行） */}
        <section className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/40 p-8 shadow-xl backdrop-blur-md transition-colors duration-700 dark:border-white/10 dark:bg-slate-800/50 lg:col-span-12 sm:p-10">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-400/30 blur-3xl" />
          <div className="relative z-10">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              欢迎回来，{username}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
              这里是你的个人漫画管理中心。搜索站源、下发爬虫任务、整理藏书阁与本地资源，一切尽在掌握。
            </p>
          </div>
        </section>

        {/* 功能卡片：bento 网格，尺寸不一 */}
        <HomeCard
          className="lg:col-span-7"
          to="/search"
          accent={ACCENTS.indigo}
          image="/cards/search.png"
          label="Search"
          title="在线搜索"
          desc="搜索 JM 站源，命中后可直接添加下载任务，无需离开当前页面。"
        />
        <HomeCard
          className="lg:col-span-5"
          to="/crawl"
          accent={ACCENTS.purple}
          image="/cards/crawl.png"
          label="Crawl"
          title="爬虫中心"
          desc="输入 ID 或链接，开始新的下载任务。"
        />
        <HomeCard
          className="lg:col-span-5"
          to="/library"
          accent={ACCENTS.sky}
          image="/cards/library.jpg"
          label="Library"
          title="JM 藏书阁"
          desc="浏览已下载的本子和章节。"
        />
        <HomeCard
          className="lg:col-span-7"
          to="/local"
          accent={ACCENTS.pink}
          image="/cards/local.jpg"
          label="Local"
          title="本地资源"
          desc="浏览服务器上的本地文件夹，图片与视频分类查看，随点随看。"
        />
      </main>
    </div>
  )
}
