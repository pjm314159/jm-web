//! JM comic image descramble decoder.
//!
//! 将 JM 站点的混淆图片（纵向切片乱序）还原为正确顺序。
//! 输入：原始图片字节（webp/jpeg/png）+ 切片数 num
//! 输出：解码后的 RGBA 像素 buffer + 宽高

use image::GenericImageView;
use wasm_bindgen::prelude::*;

/// 反混淆结果：RGBA 像素 + 宽高
#[wasm_bindgen]
pub struct DecodeResult {
    pixels: Vec<u8>,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl DecodeResult {
    #[wasm_bindgen(getter)]
    pub fn pixels(&self) -> Vec<u8> {
        self.pixels.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }
}

/// 解码并反混淆 JM 图片。
///
/// - `data`: 原始图片字节（支持 webp/jpeg/png）
/// - `num`: 混淆切片数（<=1 表示无混淆，直接解码返回）
#[wasm_bindgen]
pub fn descramble(data: &[u8], num: u32) -> Result<DecodeResult, JsValue> {
    let img = image::load_from_memory(data).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let (w, h) = img.dimensions();
    let rgba = img.to_rgba8();
    let raw = rgba.as_raw();

    if num <= 1 {
        return Ok(DecodeResult {
            pixels: raw.clone(),
            width: w,
            height: h,
        });
    }

    let n = num as usize;
    let h_usize = h as usize;
    let w_usize = w as usize;
    let over = h_usize % n;
    let slice_h = h_usize / n;

    let mut output = vec![0u8; w_usize * h_usize * 4];

    for i in 0..n {
        let move_h = if i == 0 { slice_h + over } else { slice_h };
        let y_src = if i == 0 {
            h_usize - slice_h - over
        } else {
            h_usize - slice_h * (i + 1) - over
        };
        let y_dst = if i == 0 { 0 } else { slice_h * i + over };

        for row in 0..move_h {
            let src_start = (y_src + row) * w_usize * 4;
            let dst_start = (y_dst + row) * w_usize * 4;
            let row_bytes = w_usize * 4;
            output[dst_start..dst_start + row_bytes]
                .copy_from_slice(&raw[src_start..src_start + row_bytes]);
        }
    }

    Ok(DecodeResult {
        pixels: output,
        width: w,
        height: h,
    })
}
