/**
 * useVirtualImages：在线阅读器虚拟滚动窗口管理。
 *
 * - 监听滚动，计算当前视口对应的图片索引
 * - 根据 .env 配置确定「预加载窗口」和「WASM 解码窗口」
 * - 通过 Web Worker 异步 fetch + WASM 反混淆 → ImageBitmap
 * - LRU 缓存已解码位图（以 URL 为 key），超出容量时淘汰最久未访问项
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
}

type ImageStateMap = Record<number, ImageEntry>

const IDLE_ENTRY: ImageEntry = { status: 'idle', bitmap: null, width: 0, height: 0 }

export function useVirtualImages(images: SearchReaderImage[]) {
  const [stateMap, setStateMap] = useState<ImageStateMap>({})
  const [firstVisible, setFirstVisible] = useState(0)

  const workerRef = useRef<Worker | null>(null)
  const cacheRef = useRef<ImageBitmapLRU>(new ImageBitmapLRU(READER_CONFIG.CACHE_SIZE))
  const pendingRef = useRef(new Set<number>())
  const reqIdRef = useRef(0)
  const rafRef = useRef(0)
  /** reqId → index 映射 */
  const reqIndexMap = useRef(new Map<number, number>())
  /** images 引用（用于在 worker 回调中取 url） */
  const imagesRef = useRef(images)
  imagesRef.current = images
  /** stateMap 镜像 ref（避免 load-window effect 的 stale closure） */
  const stateMapRef = useRef(stateMap)
  stateMapRef.current = stateMap

  // 初始化 Worker（整个组件生命周期只创建一次）
  useEffect(() => {
    const worker = new Worker(new URL('../../workers/decode.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
      const { id, bitmap, width, height, error } = e.data
      const idx = reqIndexMap.current.get(id)
      if (idx === undefined) return
      reqIndexMap.current.delete(id)
      pendingRef.current.delete(idx)

      if (error || !bitmap) {
        setStateMap((prev) => ({
          ...prev,
          [idx]: { status: 'error', bitmap: null, width: 0, height: 0 },
        }))
        return
      }

      // 以 URL 为缓存 key（跨页不冲突）
      const url = imagesRef.current[idx]?.url ?? String(idx)
      cacheRef.current.set(url, bitmap)

      setStateMap((prev) => ({
        ...prev,
        [idx]: { status: 'done', bitmap, width, height },
      }))
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // images 引用变化（切页/切章）→ 重置所有状态
  useEffect(() => {
    cacheRef.current.clear()
    pendingRef.current.clear()
    reqIndexMap.current.clear()
    setStateMap({})
    setFirstVisible(0)
  }, [images])

  // 请求解码单张图片
  const requestDecode = useCallback((idx: number) => {
    const imgs = imagesRef.current
    if (idx < 0 || idx >= imgs.length) return
    if (pendingRef.current.has(idx)) return

    const url = imgs[idx].url
    if (cacheRef.current.has(url)) {
      // 缓存命中
      const bmp = cacheRef.current.get(url)!
      setStateMap((prev) => ({
        ...prev,
        [idx]: { status: 'done', bitmap: bmp, width: bmp.width, height: bmp.height },
      }))
      return
    }

    const worker = workerRef.current
    if (!worker) return

    pendingRef.current.add(idx)
    const id = ++reqIdRef.current
    reqIndexMap.current.set(id, idx)

    setStateMap((prev) => ({
      ...prev,
      [idx]: { status: 'loading', bitmap: null, width: 0, height: 0 },
    }))

    const msg: DecodeRequest = { id, url, num: imgs[idx].num }
    worker.postMessage(msg)
  }, [])

  // 滚动追踪：二分查找 firstVisible
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const els = document.querySelectorAll<HTMLElement>('[data-vimg-idx]')
        if (els.length === 0) return
        const scrollY = window.scrollY + 10
        let lo = 0
        let hi = els.length - 1
        let result = 0
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (els[mid].offsetTop <= scrollY) {
            result = mid
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        setFirstVisible(result)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // 加载窗口管理：firstVisible 变化时请求解码
  useEffect(() => {
    if (images.length === 0) return

    const { PREFETCH_ABOVE, PREFETCH_BELOW, MAX_LOADED } = READER_CONFIG
    let start = firstVisible - PREFETCH_ABOVE
    let end = firstVisible + PREFETCH_BELOW
    start = Math.max(0, start)
    end = Math.min(images.length - 1, end)

    // 范围超过 MAX_LOADED 时收缩（优先保留下方）
    if (end - start + 1 > MAX_LOADED) {
      start = Math.max(0, end - MAX_LOADED + 1)
    }

    const sm = stateMapRef.current
    for (let i = start; i <= end; i++) {
      const entry = sm[i]
      if (!entry || entry.status === 'idle') {
        requestDecode(i)
      }
    }
  }, [firstVisible, images, requestDecode])

  const getEntry = useCallback(
    (idx: number): ImageEntry => stateMap[idx] ?? IDLE_ENTRY,
    [stateMap],
  )

  return { getEntry, stateMap, firstVisible }
}
