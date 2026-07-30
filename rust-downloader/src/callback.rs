use serde_json::json;
use tracing::warn;

/// 向 Django 发送进度回调
pub async fn send_progress(
    callback_url: &str,
    task_id: &str,
    done: u32,
    total: u32,
    failed: &[String],
    status: &str,
) {
    let client = reqwest::Client::new();
    let body = json!({
        "task_id": task_id,
        "done": done,
        "total": total,
        "failed": failed,
        "status": status,
    });

    if let Err(e) = client.post(callback_url).json(&body).send().await {
        warn!("进度回调失败 {callback_url}: {e}");
    }
}
