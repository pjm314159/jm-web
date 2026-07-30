/**
 * 本地图片库阅读页（正式版，对接 M3）：无章节概念，仅章内分页。
 * - 数据：GET /api/local/images/:folderName/（/media/ 图片 URL，300 图/页）
 * - 图片直接 <img> 渲染，原生懒加载
 * - 底栏单行：上一页 | 页码选择跳转（合并进 x/y 显示） | 下一页
 * - 分页走 ?page= 查询参数
 * 路由：/local/reader/:folderName
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getLocalImages } from '../api/local'
import { setPageTitle } from '../lib/usePageTitle'
import { LocalComicImage } from '../components/reader/ComicImage'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EndOfPageLine,
  PageSelect,
  ReaderError,
  ReaderHeader,
  ReaderNavShell,
  ReaderProgressBar,
  ReaderSettingsPanel,
  ReaderSkeleton,
  SettingsIcon,
  readerNavBtn,
} from '../components/reader/ReaderShell'
import { useCurrentImageIndex } from '../components/reader/useCurrentImageIndex'
import { readerBgClass, useReaderSettings } from '../components/reader/useReaderSettings'

export default function ReaderLocalPage({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean
  onToggleTheme: () => void
}) {
  const { folderName } = useParams<{ folderName: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [barsVisible, setBarsVisible] = useState(true)
  const [pageOpen, setPageOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { bg, setBg } = useReaderSettings()

  /* M3：本地图片分页 */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reader-local', folderName, page],
    queryFn: () => getLocalImages(folderName!, page),
    enabled: !!folderName,
    staleTime: 5 * 60 * 1000,
  })

  /* 切页回到顶部 */
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [folderName, page])

  useEffect(() => {
    if (folderName) setPageTitle(decodeURIComponent(folderName))
  }, [folderName])

  const ready = !!data && !isLoading
  const startIndex = data ? data.start_index - 1 : 0
  const currentImage = useCurrentImageIndex(ready, `${folderName}-${page}`, startIndex)

  if (isError) {
    return <ReaderError message="加载图片失败，文件夹可能不存在。" onBack={() => navigate('/local/images')} />
  }

  const pageCount = data?.total_pages ?? 1
  const totalImages = data?.count ?? 0

  const goPage = (p: number) => {
    setPageOpen(false)
    if (p < 1 || p > pageCount || p === page) return
    setSearchParams(p === 1 ? {} : { page: String(p) })
  }

  /** 点击图片流：面板打开时优先收起，否则切换工具栏显隐。 */
  const handleStreamClick = () => {
    if (pageOpen || settingsOpen) {
      setPageOpen(false)
      setSettingsOpen(false)
      return
    }
    setBarsVisible((v) => !v)
  }

  return (
    <div className={`relative z-10 ${readerBgClass(bg)}`}>
      {/* 纯黑/深灰模式：全覆盖背景层，遮住全局装饰 */}
      {bg !== 'default' && (
        <div className={`fixed inset-0 -z-10 ${bg === 'black' ? 'bg-black' : 'bg-neutral-900'}`} />
      )}
      <ReaderProgressBar />

      <ReaderHeader
        visible={barsVisible}
        title={data?.folder_name ?? folderName ?? '加载中…'}
        subtitle="本地图片库"
        info={totalImages > 0 ? `${currentImage + 1} / ${totalImages}` : '- / -'}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onBack={() => navigate('/local/images')}
      />

      {/* 图片流：window 滚动一页到底，无缝拼接 */}
      <div onClick={handleStreamClick} className="min-h-screen cursor-pointer pb-32">
        {!ready ? (
          <ReaderSkeleton />
        ) : (
          <>
            {data.files.map((file, i) => (
              <LocalComicImage key={file.url} url={file.url} index={startIndex + i} />
            ))}
            <EndOfPageLine
              text={page < pageCount ? '本 页 已 读 完' : '已 到 底 部'}
              nextLabel={page < pageCount ? '进 入 下 一 页' : undefined}
              onNext={page < pageCount ? () => goPage(page + 1) : undefined}
            />
          </>
        )}
      </div>

      {/* 底栏单行：上一页 | 页码选择 | 设置 | 下一页（本地无章节概念） */}
      <ReaderNavShell visible={barsVisible}>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            className={readerNavBtn}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">上一页</span>
          </button>
          <PageSelect
            open={pageOpen}
            onToggle={() => {
              setSettingsOpen(false)
              setPageOpen((v) => !v)
            }}
            page={page}
            pageCount={pageCount}
            totalImages={totalImages}
            onSelect={goPage}
          />
          {/* 阅读设置 */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setPageOpen(false)
                setSettingsOpen((v) => !v)
              }}
              aria-label="阅读设置"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition-all duration-300 hover:bg-white/50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400"
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
            <ReaderSettingsPanel
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              bg={bg}
              onBgChange={setBg}
            />
          </div>
          <button
            type="button"
            onClick={() => goPage(page + 1)}
            disabled={page >= pageCount}
            className={readerNavBtn}
          >
            <span className="hidden sm:inline">下一页</span>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </ReaderNavShell>
    </div>
  )
}
