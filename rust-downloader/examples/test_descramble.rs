//! 反混淆算法验证工具
//! 用法: cargo run --example test_descramble -- <input_path> [num]
//! 不指定 num 时，尝试 2~20 所有偶数并输出到 output 目录

use std::path::Path;

use image::GenericImageView;

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

/// 参考实现（非原地，与旧算法一致），用于运行时交叉校验
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

fn descramble(data: &[u8], num: u32, path: &str) -> Result<(), String> {
    let img = image::load_from_memory(data).map_err(|e| format!("decode: {e}"))?;

    if num <= 1 {
        std::fs::write(path, data).map_err(|e| format!("write: {e}"))?;
        return Ok(());
    }

    let (w, h) = img.dimensions();
    let mut raw = img.into_rgba8().into_raw();

    // 与参考实现交叉校验，保证原地算法正确性
    let expected = reference_descramble(&raw, w as usize, h as usize, num as usize);

    let n = num as usize;
    let h_usize = h as usize;
    let row_bytes = w as usize * 4;
    let over = h_usize % n;
    let slice_h = h_usize / n;
    let mut row_buf = vec![0u8; row_bytes];

    reverse_rows(&mut raw, 0, h_usize, row_bytes, &mut row_buf);
    let first_h = slice_h + over;
    reverse_rows(&mut raw, 0, first_h, row_bytes, &mut row_buf);
    let mut start = first_h;
    for _ in 1..n {
        reverse_rows(&mut raw, start, start + slice_h, row_bytes, &mut row_buf);
        start += slice_h;
    }

    if raw != expected {
        return Err(format!("num={num}: 原地算法结果与参考实现不一致"));
    }

    let out_img = image::RgbaImage::from_raw(w, h, raw).ok_or("failed to create output image")?;
    out_img.save(path).map_err(|e| format!("save: {e}"))?;
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("用法: cargo run --example test_descramble -- <input_path> [num]");
        std::process::exit(1);
    }

    let input = &args[1];
    let data = std::fs::read(input).expect("读取文件失败");

    // 输出目录
    let out_dir = Path::new(input).parent().unwrap_or(Path::new("."));
    let stem = Path::new(input).file_stem().unwrap().to_str().unwrap();

    let img = image::load_from_memory(&data).expect("解码失败");
    let (w, h) = img.dimensions();
    println!("图片尺寸: {w}×{h}");

    if args.len() >= 3 {
        // 指定 num
        let num: u32 = args[2].parse().expect("num 必须是数字");
        let out_path = format!("{}/{stem}_num{num}.webp", out_dir.display());
        descramble(&data, num, &out_path).expect("反混淆失败");
        println!("✓ num={num} → {out_path}");
    } else {
        // 尝试所有偶数 num
        println!("尝试 num = 2, 4, 6, ..., 20:");
        for num in (2..=20).step_by(2) {
            let out_path = format!("{}/{stem}_num{num}.webp", out_dir.display());
            match descramble(&data, num, &out_path) {
                Ok(()) => println!("  ✓ num={num:2} → {out_path}"),
                Err(e) => println!("  ✗ num={num:2} → {e}"),
            }
        }
        println!("\n请目视检查哪个 num 产出正确图像。");
    }
}
