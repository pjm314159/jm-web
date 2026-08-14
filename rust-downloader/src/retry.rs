use std::time::Duration;

use rand::Rng;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{header, StatusCode};
use tokio::io::AsyncWriteExt;
use tracing::warn;

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub jitter_cap_ms: u64,
}

/// 图片下载专用超时：JM CDN 对缺少校验头的慢速传输会截断，
/// 而走代理时 12MB GIF 可能需数分钟，30s 客户端超时必然失败。
pub const IMAGE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

/// jmcomic 下载图片时使用的请求头（对齐 APP_HEADERS_TEMPLATE + APP_HEADERS_IMAGE）。
/// CDN 会校验这些头，缺失时大文件（GIF）响应会被截断。
pub fn image_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Linux; Android 9; V1938CT Build/PQ3A.190705.11211812; wv) \
             AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36",
        ),
    );
    headers.insert(
        header::ACCEPT,
        HeaderValue::from_static(
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        ),
    );
    headers.insert(
        HeaderName::from_static("x-requested-with"),
        HeaderValue::from_static("com.JMComic3.app"),
    );
    headers.insert(
        header::REFERER,
        HeaderValue::from_static("https://18comic.vip/"),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"),
    );
    // 显式要求 identity：避免 CDN 压缩响应，保证 Content-Length 与实际字节一致
    headers.insert(
        header::ACCEPT_ENCODING,
        HeaderValue::from_static("identity"),
    );
    headers
}

#[derive(Debug)]
pub enum RetryError {
    Exhausted { attempts: u32, last_error: String },
    NonRetryable(String),
}

impl std::fmt::Display for RetryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Exhausted {
                attempts,
                last_error,
            } => {
                write!(f, "重试 {attempts} 次后仍失败: {last_error}")
            }
            Self::NonRetryable(msg) => write!(f, "不可重试: {msg}"),
        }
    }
}

/// 纯随机抖动（无指数递增）
fn jitter_delay(cap_ms: u64) -> Duration {
    let ms = rand::rng().random_range(0..cap_ms);
    Duration::from_millis(ms)
}

/// 带抖动重试的 HTTP GET，返回响应字节。
///
/// 错误分类：
/// - 404 → 不可重试
/// - 429 → 尊重 Retry-After 头
/// - 5xx / 网络错误 / 空响应 → 可重试
pub async fn fetch_with_retry(
    client: &reqwest::Client,
    url: &str,
    config: &RetryConfig,
    headers: &HeaderMap,
    timeout: Duration,
) -> Result<bytes::Bytes, RetryError> {
    let mut last_err = String::new();

    for attempt in 0..=config.max_retries {
        if attempt > 0 {
            tokio::time::sleep(jitter_delay(config.jitter_cap_ms)).await;
        }

        let mut req = client.get(url).timeout(timeout);
        if !headers.is_empty() {
            req = req.headers(headers.clone());
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();

                if status == StatusCode::OK {
                    match resp.bytes().await {
                        Ok(bytes) if !bytes.is_empty() => return Ok(bytes),
                        Ok(_) => {
                            last_err = "empty response body".into();
                            continue;
                        }
                        Err(e) => {
                            last_err = format!("read body: {e}");
                            continue;
                        }
                    }
                }

                if status == StatusCode::NOT_FOUND {
                    return Err(RetryError::NonRetryable(format!("404: {url}")));
                }

                if status == StatusCode::TOO_MANY_REQUESTS {
                    let wait = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(5);
                    warn!("429 rate limited, waiting {wait}s: {url}");
                    tokio::time::sleep(Duration::from_secs(wait)).await;
                    last_err = "429 rate limited".into();
                    continue;
                }

                // 5xx 或其他 → 可重试
                last_err = format!("HTTP {status}");
            }
            Err(e) => {
                // 网络层错误（超时、连接重置、DNS）→ 可重试
                last_err = format!("{e}");
            }
        }
    }

    Err(RetryError::Exhausted {
        attempts: config.max_retries + 1,
        last_error: last_err,
    })
}

/// 带抖动重试的流式下载：响应体边收边写入临时文件，避免整张图片驻留内存。
///
/// 只适用于无需反混淆的图片（封面 / GIF）。调用方负责在失败时清理临时文件，
/// 成功后把临时文件改名到最终路径。
pub async fn stream_to_file_with_retry(
    client: &reqwest::Client,
    url: &str,
    file_path: &str,
    config: &RetryConfig,
    headers: &HeaderMap,
    timeout: Duration,
) -> Result<(), RetryError> {
    let mut last_err = String::new();

    for attempt in 0..=config.max_retries {
        if attempt > 0 {
            tokio::time::sleep(jitter_delay(config.jitter_cap_ms)).await;
        }

        let mut req = client.get(url).timeout(timeout);
        if !headers.is_empty() {
            req = req.headers(headers.clone());
        }

        match req.send().await {
            Ok(mut resp) => {
                let status = resp.status();

                if status == StatusCode::OK {
                    let mut file = match tokio::fs::File::create(file_path).await {
                        Ok(file) => file,
                        Err(e) => {
                            last_err = format!("create temp file: {e}");
                            continue;
                        }
                    };

                    let mut total: u64 = 0;
                    let mut failed: Option<String> = None;
                    loop {
                        match resp.chunk().await {
                            Ok(Some(bytes)) => {
                                total += bytes.len() as u64;
                                if let Err(e) = file.write_all(&bytes).await {
                                    failed = Some(format!("write temp file: {e}"));
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(e) => {
                                failed = Some(format!("read body: {e}"));
                                break;
                            }
                        }
                    }

                    if let Some(err) = failed {
                        last_err = err;
                        continue;
                    }
                    if total == 0 {
                        last_err = "empty response body".into();
                        continue;
                    }
                    if let Err(e) = file.flush().await {
                        last_err = format!("flush: {e}");
                        continue;
                    }
                    return Ok(());
                }

                if status == StatusCode::NOT_FOUND {
                    return Err(RetryError::NonRetryable(format!("404: {url}")));
                }

                if status == StatusCode::TOO_MANY_REQUESTS {
                    let wait = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(5);
                    warn!("429 rate limited, waiting {wait}s: {url}");
                    tokio::time::sleep(Duration::from_secs(wait)).await;
                    last_err = "429 rate limited".into();
                    continue;
                }

                last_err = format!("HTTP {status}");
            }
            Err(e) => {
                last_err = format!("{e}");
            }
        }
    }

    Err(RetryError::Exhausted {
        attempts: config.max_retries + 1,
        last_error: last_err,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_headers_include_cdn_validation() {
        let headers = image_headers();
        assert_eq!(
            headers
                .get("x-requested-with")
                .and_then(|v| v.to_str().ok()),
            Some("com.JMComic3.app")
        );
        assert_eq!(
            headers
                .get(header::ACCEPT_ENCODING)
                .and_then(|v| v.to_str().ok()),
            Some("identity")
        );
        assert!(headers.get(header::REFERER).is_some());
    }
}
