/**
 * 图片解码 Web Worker：
 * 接收 {id, url, num} → fetch 远端图片 → WASM 反混淆 → 返回 ImageBitmap（transferable）。
 */
import initWasm, { descramble } from '../wasm/jm_wasm_decoder.js'
import wasmUrl from '../wasm/jm_wasm_decoder_bg.wasm?url'

let ready: Promise<void> | null = null

function ensureWasm(): Promise<void> {
  if (!ready) {
    ready = initWasm(wasmUrl).then(() => undefined)
  }
  return ready
}

export interface DecodeRequest {
  id: number
  url: string
  num: number
}

export interface DecodeResponse {
  id: number
  bitmap: ImageBitmap | null
  width: number
  height: number
  error?: string
}

self.addEventListener('message', async (e: MessageEvent<DecodeRequest>) => {
  const { id, url, num } = e.data
  try {
    await ensureWasm()

    const resp = await fetch(url, {
      headers: { Referer: '' },
      // 不带 cookie，避免 CORS 凭据问题
      credentials: 'omit',
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = new Uint8Array(await resp.arrayBuffer())

    const result = descramble(buf, num)
    const { width, height, pixels } = result
    result.free()

    // RGBA pixels → ImageData → ImageBitmap
    const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height)
    const bitmap = await createImageBitmap(imageData)

    const msg: DecodeResponse = { id, bitmap, width, height }
    ;(self as unknown as Worker).postMessage(msg, [bitmap])
  } catch (err) {
    const msg: DecodeResponse = {
      id,
      bitmap: null,
      width: 0,
      height: 0,
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(msg)
  }
})
