/**
 * useVirtualImages：在线阅读器虚拟滚动窗口管理。
 *
 * - scroll 事件 + getBoundingClientRect 检测图片槽进入扩展视口
 * - 进入视口的图片由 Web Worker 异步 fetch + WASM 反混淆 → ImageBitmap
 * - LRU 缓存已解码位图（以 URL 为 key），超出容量时淘汰最久未访问项
 * - 参数通过 .env VITE_READER_* 配置
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { ImageBitmapLRU } from '../../lib/imageCache'
import { READER_CONFIG } from '../../lib/readerConfig'
import type { DecodeRequest, DecodeResponse } from '../../workers/decode.worker'
import type { SearchReaderImage } from '../../api/search'

export type ImageStatus = 'idle' | 'loading' | 'done' | 'error'

export interface ImageEntry {
  status: ImageStatus
  bitmap: ImageBitmap | null
  width: number
  height: number
  /** 原始图片（如 GIF）直接渲染的 URL，不走 WASM 反混淆 */
  rawUrl?: string
}

type ImageStateMap = Record<number, ImageEntry>

const IDLE_ENTRY: ImageEntry = { status: 'idle', bitmap: null, width: 0, height: 0 }

/** 判断图片 URL 是否为 GIF（去掉查询参数后按后缀判断，与后端 is_gif 对齐）。 */
function isGifUrl(url: string): boolean {
  return url.split('?')[0].toLowerCase().endsWith('.gif')
}

export function useVirtualImages(images: SearchReaderImage[]) {
  const [stateMap, setStateMap] = useState<ImageStateMap>({})

  const workerRef = useRef<Worker | null>(null)
  const cacheRef = useRef<ImageBitmapLRU>(new ImageBitmapLRU(READER_CONFIG.CACHE_SIZE))
  const reqIdRef = useRef(0)
  const rafRef = useRef(0)
  /** reqId → index 映射 */
  const reqIndexMap = useRef(new Map<number, number>())
  /** images 引用 */
  const imagesRef = useRef(images)
  imagesRef.current = images
  /** 已请求过的索引（避免重复请求） */
  const requestedRef = useRef(new Set<number>())

  // 初始化 Worker
  useEffect(() => {
    const worker = new Worker(new URL('../../workers/decode.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.addEventListener('message', (e: MessageEvent<DecodeResponse>) => {
      const { id, bitmap, width, height, error } = e.data
      const idx = reqIndexMap.current.get(id)
      if (idx === undefined) return
      reqIndexMap.current.delete(id)

      if (error || !bitmap) {
        setStateMap((prev) => ({
          ...prev,
          [idx]: { status: 'error', bitmap: null, width: 0, height: 0 },
        }))
        return
      }

      const url = imagesRef.current[idx]?.url ?? String(idx)
      cacheRef.current.set(url, bitmap)

      setStateMap((prev) => ({
        ...prev,
        [idx]: { status: 'done', bitmap, width, height },
      }))
    })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // images 变化（切页/切章）→ 重置
  useEffect(() => {
    cacheRef.current.clear()
    reqIndexMap.current.clear()
    requestedRef.current.clear()
    setStateMap({})
  }, [images])

  // 请求解码单张图片
  const requestDecode = useCallback((idx: number) => {
    const imgs = imagesRef.current
    if (idx < 0 || idx >= imgs.length) return
    if (requestedRef.current.has(idx)) return
    requestedRef.current.add(idx)

    const url = imgs[idx].url
    // GIF 等原始图片：不经过 WASM（会丢失动画/被反混淆），直接 <img> 渲染
    if (imgs[idx].is_gif || isGifUrl(url)) {
      setStateMap((prev) => ({
        ...prev,
        [idx]: {
          status: 'done',
          bitmap: null,
          width: 0,
          height: 0,
          rawUrl: url,
        },
      }))
      return
    }
    if (cacheRef.current.has(url)) {
      const bmp = cacheRef.current.get(url)!
      setStateMap((prev) => ({
        ...prev,
        [idx]: { status: 'done', bitmap: bmp, width: bmp.width, height: bmp.height },
      }))
      return
    }

    const worker = workerRef.current
    if (!worker) return

    const id = ++reqIdRef.current
    reqIndexMap.current.set(id, idx)

    setStateMap((prev) => ({
      ...prev,
      [idx]: { status: 'loading', bitmap: null, width: 0, height: 0 },
    }))

    const msg: DecodeRequest = { id, url, num: imgs[idx].num }
    worker.postMessage(msg)
  }, [])

  // 滚动监听：直接检查元素位置，触发加载
  useEffect(() => {
    if (images.length === 0) return

    const screens = Math.max(READER_CONFIG.PREFETCH_ABOVE, READER_CONFIG.PREFETCH_BELOW)
    const marginPx = screens * window.innerHeight

    const check = () => {
      const els = document.querySelectorAll<HTMLElement>('[data-vimg-idx]')
      const viewTop = -marginPx
      const viewBot = window.innerHeight + marginPx

      els.forEach((el) => {
        const idx = Number(el.dataset.vimgIdx)
        if (Number.isNaN(idx) || requestedRef.current.has(idx)) return
        const rect = el.getBoundingClientRect()
        if (rect.bottom >= viewTop && rect.top <= viewBot) {
          requestDecode(idx)
        }
      })
    }

    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        check()
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    // 初始检查
    check()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [images, requestDecode])

  const getEntry = useCallback(
    (idx: number): ImageEntry => stateMap[idx] ?? IDLE_ENTRY,
    [stateMap],
  )

  return { getEntry, stateMap }
}
