/**
 * LRU 缓存：存储已解码的 ImageBitmap，超出容量时淘汰最久未访问项并 close()。
 */
export class ImageBitmapLRU {
  private map = new Map<string, ImageBitmap>()
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
  }

  get(key: string): ImageBitmap | undefined {
    const bmp = this.map.get(key)
    if (bmp) {
      // 刷新访问顺序（删除再插入 → 最新）
      this.map.delete(key)
      this.map.set(key, bmp)
    }
    return bmp
  }

  set(key: string, bmp: ImageBitmap): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.capacity) {
      // 淘汰最久未访问（Map 迭代首位）
      const oldest = this.map.keys().next().value as string
      const old = this.map.get(oldest)
      old?.close()
      this.map.delete(oldest)
    }
    this.map.set(key, bmp)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  delete(key: string): void {
    const bmp = this.map.get(key)
    bmp?.close()
    this.map.delete(key)
  }

  /** 清空全部（切章/切页时调用） */
  clear(): void {
    for (const bmp of this.map.values()) bmp.close()
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
