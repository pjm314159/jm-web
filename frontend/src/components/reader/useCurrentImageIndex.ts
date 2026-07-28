import { useEffect, useState } from 'react'

/** 跟踪当前阅读到的图片全局序号（顶栏 x/y 显示）。
 * 用 IntersectionObserver 观察 [data-reader-index] 元素进入视口中线带，
 * 滚动过程零主线程轮询；真实图片高度不定也能准确定位。
 * @param ready 图片流 DOM 就绪标志（数据加载完成后为 true）
 * @param resetKey 切页/切章时变化，重置当前序号 */
export function useCurrentImageIndex(ready: boolean, resetKey: string, startIndex: number) {
  const [current, setCurrent] = useState(startIndex)

  useEffect(() => {
    setCurrent(startIndex)
    if (!ready) return
    const els = document.querySelectorAll('[data-reader-index]')
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.readerIndex)
            if (!Number.isNaN(idx)) setCurrent(idx)
          }
        }
      },
      /* 视口中线附近的窄带触发，保证同一时刻只命中一张图 */
      { rootMargin: '-45% 0px -45% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ready, resetKey, startIndex])

  return current
}
