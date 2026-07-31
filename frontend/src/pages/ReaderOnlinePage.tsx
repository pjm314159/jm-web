/**
 * 在线漫画阅读页（正式版，对接 S4/S3）：搜索阅览入口。
 * - 数据：GET /api/search/photos/:photoId/images/（{url,num} 列表，300 图/页）
 *        + GET /api/search/albums/:albumId/episodes/（章节面板）
 * - 图片 WASM Worker 反混淆渲染（虚拟滚动按需解码）
 * - 底栏单层级：上一话 | 章节面板 | 页码选择跳转（x/y 即入口） | 下一话
 * - 章内分页走 ?page= 查询参数（可分享/后退），切章节切换路由 photoId
 * 路由：/search/reader/:photoId
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getSearchAlbumEpisodes, getSearchPhotoImages } from '../api/search'
import type { SearchReaderImage } from '../api/search'
import { setPageTitle } from '../lib/usePageTitle'
import { WasmComicImage } from '../components/reader/WasmComicImage'
import { useVirtualImages } from '../components/reader/useVirtualImages'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  EndOfPageLine,
  ListIcon,
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

/** 稳定空数组引用，避免 useVirtualImages 无限循环 */
const EMPTY_IMAGES: SearchReaderImage[] = []

export default function ReaderOnlinePage({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean
  onToggleTheme: () => void
}) {
  const { photoId } = useParams<{ photoId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [barsVisible, setBarsVisible] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pageOpen, setPageOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { bg, setBg } = useReaderSettings()

  /* S4：本章图片（章内分页） */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reader-online', photoId, page],
    queryFn: () => getSearchPhotoImages(photoId!, page),
    enabled: !!photoId,
    staleTime: 5 * 60 * 1000,
  })

  /* S3：章节列表（面板 + 上/下一话导航），依赖 S4 返回的 album_id */
  const albumId = data ? String(data.album_id) : ''
  const { data: episodesData } = useQuery({
    queryKey: ['reader-episodes', albumId],
    queryFn: () => getSearchAlbumEpisodes(albumId),
    enabled: !!albumId,
    staleTime: 5 * 60 * 1000,
  })

  /* 切章/切页回到顶部 */
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [photoId, page])

  useEffect(() => {
    if (episodesData?.name) setPageTitle(episodesData.name)
  }, [episodesData?.name])

  const ready = !!data && !isLoading
  const startIndex = data ? data.current_start_index - 1 : 0
  const currentImage = useCurrentImageIndex(ready, `${photoId}-${page}`, startIndex)

  /* WASM 虚拟滚动窗口 */
  const { getEntry } = useVirtualImages(data?.images ?? EMPTY_IMAGES)

  if (isError) {
    return <ReaderError message="加载阅读数据失败，可能是网络问题或章节不存在。" onBack={() => navigate(-1)} />
  }

  const episodes = episodesData?.episode_list ?? []
  const chapterIdx = episodes.findIndex((ep) => String(ep.photo_id) === photoId)
  const chapterName =
    chapterIdx >= 0 ? episodes[chapterIdx].name || `第${episodes[chapterIdx].index}话` : `JM-${photoId}`
  const hasPrevChapter = chapterIdx > 0
  const hasNextChapter = chapterIdx >= 0 && chapterIdx < episodes.length - 1

  const pageCount = data?.total_pages ?? 1
  const totalImages = data?.total_images ?? 0

  const goChapter = (idx: number) => {
    if (idx < 0 || idx >= episodes.length) return
    setPanelOpen(false)
    setPageOpen(false)
    navigate(`/search/reader/${episodes[idx].photo_id}`)
  }
  const goPage = (p: number) => {
    setPageOpen(false)
    if (p < 1 || p > pageCount || p === page) return
    setSearchParams(p === 1 ? {} : { page: String(p) })
  }

  /** 点击图片流：优先收起弹出面板，否则切换工具栏 */
  const handleStreamClick = () => {
    if (panelOpen || pageOpen || settingsOpen) {
      setPanelOpen(false)
      setPageOpen(false)
      setSettingsOpen(false)
    } else {
      setBarsVisible((v) => !v)
    }
  }

  return (
    <div className={`relative z-10 ${readerBgClass(bg)}`}>
      {/* 纯黑/深灰模式：全覆盖背景层，遮住全局装饰 */}
      {bg !== 'default' && (
        <div className={`fixed inset-0 -z-10 ${bg === 'black' ? 'bg-black' : 'bg-neutral-900'}`} />
      )}
      <ReaderProgressBar current={currentImage - startIndex} total={data?.images.length ?? 0} />

      <ReaderHeader
        visible={barsVisible}
        title={chapterName}
        subtitle={episodesData?.name ?? '在线阅读'}
        info={totalImages > 0 ? `${currentImage + 1} / ${totalImages}` : '- / -'}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onBack={() => (albumId ? navigate(`/search/album/${albumId}`) : navigate(-1))}
      />

      {/* 图片流：WASM 虚拟滚动窗口，按需解码 */}
      <div onClick={handleStreamClick} className="min-h-screen cursor-pointer pb-32">
        {!ready ? (
          <ReaderSkeleton />
        ) : (
          <>
            {data.images.map((_, i) => (
              <WasmComicImage key={data.images[i].url} entry={getEntry(i)} index={startIndex + i} slotIdx={i} />
            ))}
            <EndOfPageLine
              text={
                page < pageCount ? '本 页 已 读 完' : hasNextChapter ? '本 话 已 读 完' : '全 本 完'
              }
              nextLabel={
                page < pageCount ? '进 入 下 一 页' : hasNextChapter ? '进 入 下 一 话' : undefined
              }
              onNext={
                page < pageCount
                  ? () => goPage(page + 1)
                  : hasNextChapter
                    ? () => goChapter(chapterIdx + 1)
                    : undefined
              }
            />
          </>
        )}
      </div>

      <ReaderNavShell
        visible={barsVisible}
        panel={
          /* 章节选择面板（向上弹出） */
          <div
            className={`absolute inset-x-0 bottom-[calc(100%+10px)] origin-bottom transition-all duration-300 ${
              panelOpen
                ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none translate-y-3 scale-95 opacity-0'
            }`}
          >
            <div className="overflow-hidden rounded-3xl border border-white/40 bg-white/60 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/80">
              <div className="flex items-center justify-between border-b border-white/30 px-5 py-3 dark:border-white/10">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-100">章节选择</span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  共 {episodes.length} 话
                </span>
              </div>
              <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto p-4 sm:grid-cols-6">
                {episodes.map((ep, idx) => (
                  <button
                    key={ep.photo_id}
                    type="button"
                    onClick={() => goChapter(idx)}
                    title={ep.name || `第${ep.index}话`}
                    className={
                      idx === chapterIdx
                        ? 'truncate rounded-xl border border-white/25 bg-[#5A67FF] px-2 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30'
                        : 'truncate rounded-xl bg-white/40 px-2 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-white/70 hover:text-indigo-600 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-indigo-400'
                    }
                  >
                    {ep.name || `第${ep.index}话`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
      >
        {/* 单层级底栏：上一话 | 章节面板 | 页码选择 | 设置 | 下一话 */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goChapter(chapterIdx - 1)}
            disabled={!hasPrevChapter}
            className={readerNavBtn}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">上一话</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPageOpen(false)
              setSettingsOpen(false)
              setPanelOpen((v) => !v)
            }}
            disabled={episodes.length === 0}
            className="flex min-w-0 max-w-[200px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white/40 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:text-indigo-400 sm:max-w-[240px]"
          >
            <ListIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{chapterName}</span>
            <ChevronUpIcon
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${panelOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {/* 页码选择跳转 */}
          <PageSelect
            open={pageOpen}
            onToggle={() => {
              setPanelOpen(false)
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
                setPanelOpen(false)
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
            onClick={() => goChapter(chapterIdx + 1)}
            disabled={!hasNextChapter}
            className={readerNavBtn}
          >
            <span className="hidden sm:inline">下一话</span>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </ReaderNavShell>
    </div>
  )
}
