use serde_json::json;
use tracing::warn;

/// 向 Django 发送进度回调（复用全局 reqwest::Client，避免每次新建连接）
#[allow(clippy::too_many_arguments)]
pub async fn send_progress(
    client: &reqwest::Client,
    callback_url: &str,
    task_id: &str,
    done: u32,
    total: u32,
    failed: &[String],
    status: &str,
    token: Option<&str>,
) {
    let body = json!({
        "task_id": task_id,
        "done": done,
        "total": total,
        "failed": failed,
        "status": status,
    });

    let mut request = client.post(callback_url).json(&body);
    if let Some(token) = token {
        request = request.header("X-Internal-Token", token);
    }

    if let Err(e) = request.send().await {
        warn!("进度回调失败 {callback_url}: {e}");
    }
}
