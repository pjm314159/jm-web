import { Link } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

/**
 * 首页：
 * - 欢迎横幅（展示登录用户）
 * - 四个功能入口卡片（链接到对应路由，功能页暂为占位）
 */

type Accent = {
  /** 标签/链接文字颜色（叠加在图片上的亮色系） */
  onImage: string
  /** 标签前的小圆点 */
  dot: string
  /** 悬停光晕 */
  glow: string
}

const ACCENTS: Record<string, Accent> = {
  indigo: {
    onImage: 'text-indigo-300',
    dot: 'bg-indigo-400',
    glow: 'bg-indigo-400',
  },
  purple: {
    onImage: 'text-purple-300',
    dot: 'bg-purple-400',
    glow: 'bg-purple-400',
  },
  sky: {
    onImage: 'text-sky-300',
    dot: 'bg-sky-400',
    glow: 'bg-sky-400',
  },
  pink: {
    onImage: 'text-pink-300',
    dot: 'bg-pink-400',
    glow: 'bg-pink-400',
  },
  amber: {
    onImage: 'text-amber-300',
    dot: 'bg-amber-400',
    glow: 'bg-amber-400',
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
      className={`group relative block h-64 overflow-hidden rounded-3xl border border-white/40 shadow-xl transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl dark:border-white/10 sm:h-72 ${className}`}
    >
      {/* 封面图：铺满卡片（允许裁切），悬停轻微放大 */}
      <img
        src={image}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
      />
      {/* 渐进式 overlay：自底向上渐变压暗，下方文字清晰可读、上方图片原样呈现 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      {/* 悬停光晕 */}
      <div
        className={`absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-50 ${accent.glow}`}
      />

      {/* 文字直接叠在图片上（底部渐变保证可读性） */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-6 sm:p-7">
        <div
          className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${accent.onImage}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          {label}
        </div>
        <h3 className="mb-1.5 text-xl font-bold text-white drop-shadow-sm sm:text-2xl">{title}</h3>
        <p className="text-sm leading-relaxed text-white/75 sm:text-base">{desc}</p>
        <div className={`mt-4 flex items-center gap-1.5 text-sm font-semibold ${accent.onImage}`}>
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
          image="/cards/search.avif"
          label="Search"
          title="在线搜索"
          desc="搜索 JM 站源，命中后可直接添加下载任务，无需离开当前页面。"
        />
        <HomeCard
          className="lg:col-span-5"
          to="/crawl"
          accent={ACCENTS.purple}
          image="/cards/crawl.avif"
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
          image="/cards/local.avif"
          label="Local"
          title="本地资源"
          desc="浏览服务器上的本地文件夹，图片与视频分类查看，随点随看。"
        />
        <HomeCard
          className="lg:col-span-12"
          to="/leaderboard"
          accent={ACCENTS.amber}
          image="/cards/leaderboard.avif"
          label="Rank"
          title="排行榜"
          desc="月 / 周 / 日排行，配合时间、分类等多条件筛选站源作品。"
        />
      </main>
    </div>
  )
}
