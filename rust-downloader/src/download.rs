use std::path::Path;
use std::sync::Arc;

use futures::stream::{self, StreamExt};
use image::GenericImageView;
use md5::{Digest, Md5};
use tokio::sync::Semaphore;
use tracing::{debug, warn};

use crate::retry::{fetch_with_retry, RetryConfig};

/// 单张图片条目
#[derive(Debug, Clone)]
pub struct ImageEntry {
    pub url: String,
    pub filename: String,
    /// 为 true 时跳过反混淆，直接保存原图（如封面）
    pub no_descramble: bool,
}

/// 章节下载结果
#[derive(Debug, Default)]
pub struct ChapterResult {
    pub success: u32,
    pub failed: Vec<String>,
    pub total: u32,
}

/// 计算 JM 混淆切片数（与 jmcomic JmImageTool.get_num 一致）
pub fn calc_scramble_num(scramble_id: u64, aid: u64, filename: &str) -> u32 {
    if aid < scramble_id {
        return 0;
    }
    if aid < 268850 {
        return 10;
    }
    let x: u32 = if aid < 421926 { 10 } else { 8 };
    let input = format!("{aid}{filename}");
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let hex_str = format!("{result:x}");
    let last_char = hex_str.as_bytes()[31] as u32;
    (last_char % x) * 2 + 2
}

/// 反混淆并保存（与 frontend/wasm/src/lib.rs 相同算法）
fn descramble_and_save(data: &[u8], num: u32, path: &str) -> Result<(), String> {
    let img = image::load_from_memory(data).map_err(|e| format!("decode: {e}"))?;

    if num <= 1 {
        std::fs::write(path, data).map_err(|e| format!("write: {e}"))?;
        return Ok(());
    }

    let (w, h) = img.dimensions();
    let rgba = img.to_rgba8();
    let raw = rgba.as_raw();

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

    let out_img = image::RgbaImage::from_raw(w, h, output)
        .ok_or_else(|| "failed to create output image".to_string())?;
    out_img.save(path).map_err(|e| format!("save: {e}"))?;
    Ok(())
}

/// 下载单张图片（断点续传：文件已存在且非空则跳过）
async fn download_one(
    client: &reqwest::Client,
    retry_config: &RetryConfig,
    semaphore: &Arc<Semaphore>,
    save_dir: &str,
    scramble_id: u64,
    aid: u64,
    img: &ImageEntry,
) -> Result<(), String> {
    let _permit = semaphore
        .acquire()
        .await
        .map_err(|e| format!("semaphore: {e}"))?;

    let path = format!("{save_dir}/{}", img.filename);

    // 断点续传：已存在且非空 → 跳过
    if let Ok(meta) = tokio::fs::metadata(&path).await {
        if meta.len() > 0 {
            debug!("跳过已存在: {}", img.filename);
            return Ok(());
        }
    }

    // 确保目录存在
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir: {e}"))?;
    }

    let bytes = fetch_with_retry(client, &img.url, retry_config)
        .await
        .map_err(|e| e.to_string())?;

    // 封面等无需反混淆的图片直接保存
    if img.no_descramble {
        std::fs::write(&path, &bytes).map_err(|e| format!("write: {e}"))?;
        return Ok(());
    }

    // MD5 计算用不含后缀的文件名（与 jmcomic JmImageDetail.img_file_name 一致）
    let stem = img
        .filename
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(&img.filename);
    let num = calc_scramble_num(scramble_id, aid, stem);

    // 解码失败重试 1 次
    if let Err(e) = descramble_and_save(&bytes, num, &path) {
        warn!("解码失败 {}，重试: {e}", img.filename);
        let bytes2 = fetch_with_retry(client, &img.url, retry_config)
            .await
            .map_err(|e| e.to_string())?;
        descramble_and_save(&bytes2, num, &path)?;
    }

    Ok(())
}

/// 并发下载整个章节，单张失败不中断。
/// `concurrency` 控制每任务并发窗口，`progress_fn` 每完成一张调用一次。
#[allow(clippy::too_many_arguments)]
pub async fn download_chapter(
    client: &reqwest::Client,
    retry_config: &RetryConfig,
    semaphore: &Arc<Semaphore>,
    save_dir: &str,
    scramble_id: u64,
    aid: u64,
    images: &[ImageEntry],
    concurrency: usize,
    mut progress_fn: impl FnMut(u32, u32),
) -> ChapterResult {
    let total = images.len() as u32;
    let mut result = ChapterResult {
        total,
        ..Default::default()
    };
    let mut done = 0u32;

    let results: Vec<Result<(), String>> = stream::iter(images.iter().cloned())
        .map(|img| async move {
            download_one(
                client,
                retry_config,
                semaphore,
                save_dir,
                scramble_id,
                aid,
                &img,
            )
            .await
        })
        .buffer_unordered(concurrency.max(1))
        .collect()
        .await;

    for res in results {
        done += 1;
        match res {
            Ok(()) => result.success += 1,
            Err(e) => {
                warn!("图片失败: {e}");
                result.failed.push(e);
            }
        }
        progress_fn(done, total);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calc_scramble_num_known_value() {
        // 对应 jmcomic: JmImageTool.get_num(220980, 1319207, '00002') == 16
        let num = calc_scramble_num(220980, 1319207, "00002");
        assert_eq!(num, 16, "aid=1319207, filename=00002 应得 num=16");
    }

    #[test]
    fn test_calc_scramble_num_below_scramble_id() {
        assert_eq!(calc_scramble_num(220980, 100000, "00001"), 0);
    }

    #[test]
    fn test_calc_scramble_num_below_268850() {
        assert_eq!(calc_scramble_num(220980, 250000, "00001"), 10);
    }

    #[test]
    fn test_descramble_roundtrip() {
        // 创建一张测试图片，descramble 验证不崩溃
        let w = 100u32;
        let h = 160u32;
        let mut img = image::RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                img.put_pixel(x, y, image::Rgba([y as u8, x as u8, 128, 255]));
            }
        }
        let dir = std::env::temp_dir();
        let orig_path = dir.join("test_orig.webp");
        let out_path = dir.join("test_descrambled.webp");
        img.save(&orig_path).unwrap();

        let data = std::fs::read(&orig_path).unwrap();
        descramble_and_save(&data, 16, out_path.to_str().unwrap()).unwrap();

        let meta = std::fs::metadata(&out_path).unwrap();
        assert!(meta.len() > 0);

        let _ = std::fs::remove_file(&orig_path);
        let _ = std::fs::remove_file(&out_path);
    }
}
