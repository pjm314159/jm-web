use std::path::{Path, PathBuf};
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
    /// 可选保存路径（绝对路径）；为空时保存到 `{save_dir}/{filename}`
    pub save_path: Option<String>,
}

/// 章节下载结果
#[derive(Debug, Default)]
pub struct ChapterResult {
    pub success: u32,
    pub failed: Vec<String>,
    pub total: u32,
}

/// 严格校验单段文件名：拒绝路径分隔符、点开头、`..`、控制字符等。
fn validate_single_component(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains("..")
        && !name.starts_with('.')
        && !name.contains('/')
        && !name.contains('\\')
        && !name.chars().any(|c| c.is_control())
}

/// 构建下载输出路径，并对保存路径做路径穿越校验。
fn build_output_path(save_dir: &str, img: &ImageEntry) -> Result<PathBuf, String> {
    if let Some(save_path) = &img.save_path {
        let path = Path::new(save_path);
        if path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(format!("unsafe save_path: {save_path}"));
        }
        return Ok(path.to_path_buf());
    }
    if !validate_single_component(&img.filename) {
        return Err(format!("unsafe filename: {}", img.filename));
    }
    Ok(Path::new(save_dir).join(&img.filename))
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

/// 原地反转 [start, end) 范围内的行，row_buf 为单行临时缓冲
fn reverse_rows(buf: &mut [u8], start: usize, end: usize, row_bytes: usize, row_buf: &mut [u8]) {
    let mut lo = start;
    let mut hi = end;
    while lo + 1 < hi {
        let a = lo * row_bytes;
        let b = (hi - 1) * row_bytes;
        row_buf.copy_from_slice(&buf[a..a + row_bytes]);
        buf.copy_within(b..b + row_bytes, a);
        buf[b..b + row_bytes].copy_from_slice(row_buf);
        lo += 1;
        hi -= 1;
    }
}

/// 原地反混淆（P2 方案 A：O(1) 额外内存，仅一行缓冲）
///
/// 反混淆本质 = 将 n 个连续行块逆序排列：源图自上而下为
/// `[slice_h] × (n-1)` + 末块 `[slice_h + over]`，反混淆后末块置顶、其余逆序。
/// 采用经典「整体反转 + 逐块反转」原地技巧，无需全图输出缓冲。
fn descramble_in_place(raw: &mut [u8], w: usize, h: usize, num: usize) {
    let row_bytes = w * 4;
    let over = h % num;
    let slice_h = h / num;
    let mut row_buf = vec![0u8; row_bytes];

    // 1) 整体反转：行块顺序颠倒，但块内行序也颠倒
    reverse_rows(raw, 0, h, row_bytes, &mut row_buf);

    // 2) 逐块反转恢复块内行序（整体反转后首块为原末块，高 slice_h + over）
    let first_h = slice_h + over;
    reverse_rows(raw, 0, first_h, row_bytes, &mut row_buf);
    let mut start = first_h;
    for _ in 1..num {
        reverse_rows(raw, start, start + slice_h, row_bytes, &mut row_buf);
        start += slice_h;
    }
}

/// 反混淆并保存（原地算法，单张峰值 ≈ 一份像素缓冲，与 frontend/wasm 逻辑等价）
fn descramble_and_save(data: &[u8], num: u32, path: &str) -> Result<(), String> {
    let img = image::load_from_memory(data).map_err(|e| format!("decode: {e}"))?;

    if num <= 1 {
        std::fs::write(path, data).map_err(|e| format!("write: {e}"))?;
        return Ok(());
    }

    let (w, h) = img.dimensions();
    // P1 + P2：into_rgba8 零拷贝转换，再取走 Vec<u8> 原地重排
    let mut raw = img.into_rgba8().into_raw();

    descramble_in_place(&mut raw, w as usize, h as usize, num as usize);

    let out_img = image::RgbaImage::from_raw(w, h, raw)
        .ok_or_else(|| "failed to create output image".to_string())?;
    out_img.save(path).map_err(|e| format!("save: {e}"))?;
    Ok(())
}

/// 下载单张图片（断点续传：文件已存在且非空则跳过）
#[allow(clippy::too_many_arguments)]
async fn download_one(
    client: &reqwest::Client,
    retry_config: &RetryConfig,
    net_semaphore: &Arc<Semaphore>,
    decode_semaphore: Option<&Arc<Semaphore>>,
    save_dir: &str,
    scramble_id: u64,
    aid: u64,
    img: &ImageEntry,
) -> Result<(), String> {
    let path = build_output_path(save_dir, img)?;
    let path_str = path
        .to_str()
        .ok_or_else(|| format!("non-UTF-8 output path: {}", path.display()))?;

    // 断点续传：已存在且非空 → 跳过
    if let Ok(meta) = tokio::fs::metadata(path_str).await {
        if meta.len() > 0 {
            debug!("跳过已存在: {}", img.filename);
            return Ok(());
        }
    }

    // 确保目录存在
    if let Some(parent) = Path::new(path_str).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir: {e}"))?;
    }

    // 阶段 1：网络下载（受 net_semaphore 限制，IO-bound，内存小）
    let bytes = {
        let _net_permit = net_semaphore
            .acquire()
            .await
            .map_err(|e| format!("semaphore: {e}"))?;
        fetch_with_retry(client, &img.url, retry_config)
            .await
            .map_err(|e| e.to_string())?
    }; // ← net_permit 在此释放

    // 封面等无需反混淆的图片直接保存
    if img.no_descramble {
        std::fs::write(path_str, &bytes).map_err(|e| format!("write: {e}"))?;
        return Ok(());
    }

    // 阶段 2：反混淆+写盘（受 decode_semaphore 限制，CPU-bound，内存大）
    let _decode_permit = match decode_semaphore {
        Some(sem) => Some(
            sem.acquire()
                .await
                .map_err(|e| format!("decode semaphore: {e}"))?,
        ),
        None => None, // 0 = 不限制
    };

    // MD5 计算用不含后缀的文件名（与 jmcomic JmImageDetail.img_file_name 一致）
    let stem = img
        .filename
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(&img.filename);
    let num = calc_scramble_num(scramble_id, aid, stem);

    // 解码失败重试 1 次
    if let Err(e) = descramble_and_save(&bytes, num, path_str) {
        warn!("解码失败 {}，重试: {e}", img.filename);
        let bytes2 = fetch_with_retry(client, &img.url, retry_config)
            .await
            .map_err(|e| e.to_string())?;
        descramble_and_save(&bytes2, num, path_str)?;
    }

    Ok(())
}

/// 并发下载整个章节，单张失败不中断。
/// `concurrency` 控制每任务并发窗口，`progress_fn` 每完成一张调用一次。
#[allow(clippy::too_many_arguments)]
pub async fn download_chapter(
    client: &reqwest::Client,
    retry_config: &RetryConfig,
    net_semaphore: &Arc<Semaphore>,
    decode_semaphore: Option<&Arc<Semaphore>>,
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

    // 将 Option<&Arc<Semaphore>> 转为 Option<Arc<Semaphore>> 以便在闭包中 clone
    let decode_sem = decode_semaphore.cloned();
    let net_sem = net_semaphore.clone();

    let mut futures = stream::iter(images.iter().cloned())
        .map(|img| {
            let net_sem = net_sem.clone();
            let decode_sem = decode_sem.clone();
            async move {
                download_one(
                    client,
                    retry_config,
                    &net_sem,
                    decode_sem.as_ref(),
                    save_dir,
                    scramble_id,
                    aid,
                    &img,
                )
                .await
            }
        })
        .buffer_unordered(concurrency.max(1));

    while let Some(res) = futures.next().await {
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

    /// 参考实现（非原地，与旧算法逻辑一致），用于与原地算法交叉验证
    fn reference_descramble(raw: &[u8], w: usize, h: usize, num: usize) -> Vec<u8> {
        let row_bytes = w * 4;
        let over = h % num;
        let slice_h = h / num;
        let mut output = vec![0u8; w * h * 4];
        for i in 0..num {
            let move_h = if i == 0 { slice_h + over } else { slice_h };
            let y_src = if i == 0 {
                h - slice_h - over
            } else {
                h - slice_h * (i + 1) - over
            };
            let y_dst = if i == 0 { 0 } else { slice_h * i + over };
            for row in 0..move_h {
                let s = (y_src + row) * row_bytes;
                let d = (y_dst + row) * row_bytes;
                output[d..d + row_bytes].copy_from_slice(&raw[s..s + row_bytes]);
            }
        }
        output
    }

    #[test]
    fn test_in_place_matches_reference() {
        // 覆盖：整除/非整除高度、极端 num、over=0、slice_h=0
        let cases: [(usize, usize, usize); 6] = [
            (100, 160, 16),
            (73, 101, 7),
            (64, 64, 2),
            (50, 137, 20),
            (32, 60, 10),
            (16, 7, 20),
        ];
        for (w, h, num) in cases {
            let raw: Vec<u8> = (0..w * h * 4)
                .map(|i| i.wrapping_mul(31).wrapping_add(7) as u8)
                .collect();
            let expected = reference_descramble(&raw, w, h, num);
            let mut actual = raw.clone();
            descramble_in_place(&mut actual, w, h, num);
            assert_eq!(actual, expected, "mismatch: w={w} h={h} num={num}");
        }
    }

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
    fn test_validate_single_component() {
        assert!(validate_single_component("00001.jpg"));
        assert!(validate_single_component("cover.png"));
        assert!(!validate_single_component(""));
        assert!(!validate_single_component(".."));
        assert!(!validate_single_component("a..b"));
        assert!(!validate_single_component("../x.jpg"));
        assert!(!validate_single_component("a/b.jpg"));
        assert!(!validate_single_component("a\\b.jpg"));
        assert!(!validate_single_component(".hidden.jpg"));
        assert!(!validate_single_component("a\nb.jpg"));
    }

    #[test]
    fn test_build_output_path_rejects_traversal() {
        let safe = ImageEntry {
            url: "https://x/1.jpg".into(),
            filename: "1.jpg".into(),
            no_descramble: false,
            save_path: None,
        };
        assert_eq!(
            build_output_path("/tmp", &safe).unwrap(),
            Path::new("/tmp").join("1.jpg")
        );

        let bad_filename = ImageEntry {
            url: "https://x/e.jpg".into(),
            filename: "../evil.jpg".into(),
            no_descramble: false,
            save_path: None,
        };
        assert!(build_output_path("/tmp", &bad_filename).is_err());

        let bad_save_path = ImageEntry {
            url: "https://x/e.jpg".into(),
            filename: "1.jpg".into(),
            no_descramble: false,
            save_path: Some("/tmp/../evil.jpg".into()),
        };
        assert!(build_output_path("/tmp", &bad_save_path).is_err());
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
