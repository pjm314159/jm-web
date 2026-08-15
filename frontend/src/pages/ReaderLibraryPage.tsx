/**
 * 藏书阁漫画阅读页（正式版，对接 L5/L2）：读本地已下载章节。
 * - 数据：GET /api/library/photos/:photoId/（/media/ 图片 URL，300 图/页，含上/下章 id）
 *        + GET /api/library/albums/:albumId/（章节面板）
 * - 图片直接 <img> 渲染（本地文件无混淆），原生懒加载
 * - 底栏单层级：上一话 | 章节面板 | 页码选择跳转 | 下一话
 * - 章内分页走 ?page= 查询参数，切章节切换路由 photoId
 * 路由：/library/reader/:photoId
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getAlbumDetail, getPhotoReader } from '../api/library'
import CommentSection from '../components/CommentSection'
import { setPageTitle } from '../lib/usePageTitle'
import { READER_CONFIG } from '../lib/readerConfig'
import { LocalComicImage } from '../components/reader/ComicImage'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CommentBubbleIcon,
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

export default function ReaderLibraryPage({
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
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsTouched, setCommentsTouched] = useState(false)
  const { bg, setBg } = useReaderSettings()

  /* L5：本章图片（章内分页 + 上/下章 id） */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reader-library', photoId, page],
    queryFn: () => getPhotoReader(Number(photoId), page),
    enabled: !!photoId,
    staleTime: READER_CONFIG.READER_STALE_TIME,
  })

  /* L2：本子详情（章节面板 + 本子名），依赖 L5 返回的 album_id */
  const albumId = data?.album_id
  const { data: album } = useQuery({
    queryKey: ['library-detail', String(albumId)],
    queryFn: () => getAlbumDetail(albumId!),
    enabled: !!albumId,
    staleTime: READER_CONFIG.READER_STALE_TIME,
  })

  /* 切章/切页回到顶部 */
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [photoId, page])

  useEffect(() => {
    if (album?.name) setPageTitle(album.name)
  }, [album?.name])

  const ready = !!data && !isLoading
  const startIndex = data ? data.current_start_index - 1 : 0
  const currentImage = useCurrentImageIndex(ready, `${photoId}-${page}`, startIndex)

  if (isError) {
    return <ReaderError message="加载阅读数据失败，章节可能已被删除。" onBack={() => navigate('/library')} />
  }

  const photos = album?.photos ?? []
  const pageCount = data?.total_pages ?? 1
  const totalImages = data?.total_images ?? 0
  const hasPrevChapter = data?.prev_photo_id != null
  const hasNextChapter = data?.next_photo_id != null

  const goPhoto = (pid: number | null | undefined) => {
    if (pid == null) return
    setPanelOpen(false)
    setPageOpen(false)
    navigate(`/library/reader/${pid}`)
  }
  const goPage = (p: number) => {
    setPageOpen(false)
    if (p < 1 || p > pageCount || p === page) return
    setSearchParams(p === 1 ? {} : { page: String(p) })
  }

  /** 点击图片流：优先收起弹出面板，否则切换工具栏 */
  const handleStreamClick = () => {
    if (panelOpen || pageOpen || settingsOpen || commentsOpen) {
      setPanelOpen(false)
      setPageOpen(false)
      setSettingsOpen(false)
      setCommentsOpen(false)
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
        title={data?.name ?? '加载中…'}
        subtitle={album?.name ?? '藏书阁'}
        info={totalImages > 0 ? `${currentImage + 1} / ${totalImages}` : '- / -'}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onBack={() => (albumId ? navigate(`/library/${albumId}`) : navigate('/library'))}
      />

      {/* 图片流：window 滚动一页到底，无缝拼接 */}
      <div onClick={handleStreamClick} className="min-h-screen cursor-pointer pb-32">
        {!ready ? (
          <ReaderSkeleton />
        ) : (
          <>
            {data.images.map((url, i) => (
              <LocalComicImage key={url} url={url} index={startIndex + i} />
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
                    ? () => goPhoto(data.next_photo_id)
                    : undefined
              }
            />
          </>
        )}
      </div>

      <ReaderNavShell
        visible={barsVisible}
        panel={
          /* 章节选择面板（向上弹出；未下载章节禁用） */
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
                  共 {photos.length} 话
                </span>
              </div>
              <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto p-4 sm:grid-cols-6">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => goPhoto(photo.id)}
                    disabled={!photo.is_downloaded}
                    title={photo.name || `第${photo.sort_index}话`}
                    className={
                      photo.id === data?.photo_id
                        ? 'truncate rounded-xl border border-white/25 bg-[#5A67FF] px-2 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/30'
                        : 'truncate rounded-xl bg-white/40 px-2 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-white/70 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/40 disabled:hover:text-slate-600 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-indigo-400 dark:disabled:hover:bg-slate-800/50 dark:disabled:hover:text-slate-300'
                    }
                  >
                    {photo.name || `第${photo.sort_index}话`}
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
            onClick={() => goPhoto(data?.prev_photo_id)}
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
            disabled={photos.length === 0}
            className="flex min-w-0 max-w-[200px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/40 bg-white/40 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all duration-300 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-700/40 dark:text-slate-200 dark:hover:text-indigo-400 sm:max-w-[240px]"
          >
            <ListIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{data?.name ?? '…'}</span>
            <ChevronUpIcon
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${panelOpen ? 'rotate-180' : ''}`}
            />
          </button>
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
            onClick={() => goPhoto(data?.next_photo_id)}
            disabled={!hasNextChapter}
            className={readerNavBtn}
          >
            <span className="hidden sm:inline">下一话</span>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </ReaderNavShell>

      {/* 评论入口：右侧浮动 SVG，随导航栏同显隐，点击召唤评论抽屉 */}
      <button
        type="button"
        aria-label="查看评论"
        onClick={() => {
          setCommentsOpen(true)
          setCommentsTouched(true)
        }}
        className={`fixed right-4 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/50 text-slate-600 shadow-lg backdrop-blur-2xl transition-all duration-300 ease-out hover:scale-110 hover:border-indigo-300/60 hover:text-indigo-600 active:scale-95 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-indigo-400 ${
          barsVisible && !commentsOpen
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-16 opacity-0'
        }`}
      >
        <CommentBubbleIcon className="h-5 w-5" />
      </button>

      {/* 评论抽屉：复用在线阅读器评论区，数据来自远端 JM 评论接口，无本地存储 */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg transform transition-transform duration-300 ease-out ${
          commentsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col border-l border-white/30 bg-white/70 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/80">
          <div className="flex shrink-0 items-center justify-between border-b border-white/30 px-5 py-3 dark:border-white/10">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-100">
              <CommentBubbleIcon className="h-4 w-4 text-indigo-500" />
              评论区
            </span>
            <button
              type="button"
              aria-label="关闭评论区"
              onClick={() => setCommentsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-all duration-300 hover:bg-white/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {/* 首次打开后保持挂载，保留已加载评论；隐藏自带标题避免与抽屉头重复 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {commentsTouched && album?.jm_id ? (
              <CommentSection jmId={album.jm_id} showHeader={false} />
            ) : (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                本子数据加载中…
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
