/* tslint:disable */
/* eslint-disable */

/**
 * 反混淆结果：RGBA 像素 + 宽高
 */
export class DecodeResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly height: number;
    readonly pixels: Uint8Array;
    readonly width: number;
}

/**
 * 解码并反混淆 JM 图片。
 *
 * - `data`: 原始图片字节（支持 webp/jpeg/png）
 * - `num`: 混淆切片数（<=1 表示无混淆，直接解码返回）
 */
export function descramble(data: Uint8Array, num: number): DecodeResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_decoderesult_free: (a: number, b: number) => void;
    readonly decoderesult_height: (a: number) => number;
    readonly decoderesult_pixels: (a: number) => [number, number];
    readonly decoderesult_width: (a: number) => number;
    readonly descramble: (a: number, b: number, c: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
