use std::time::Duration;

use rand::Rng;
use reqwest::StatusCode;
use tracing::warn;

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub jitter_cap_ms: u64,
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
) -> Result<bytes::Bytes, RetryError> {
    let mut last_err = String::new();

    for attempt in 0..=config.max_retries {
        if attempt > 0 {
            tokio::time::sleep(jitter_delay(config.jitter_cap_ms)).await;
        }

        match client.get(url).send().await {
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
