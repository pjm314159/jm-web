use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tracing::{info, warn};

use crate::callback::send_progress;
use crate::config::Config;
use crate::download::{download_chapter, ImageEntry};
use crate::retry::RetryConfig;

/// 下载任务请求体（Django 提交）
#[derive(Debug, Deserialize)]
pub struct DownloadRequest {
    pub task_id: String,
    pub save_dir: String,
    pub scramble_id: String,
    pub aid: String,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    pub images: Vec<ImageEntryRaw>,
    pub callback_url: Option<String>,
}

fn default_concurrency() -> usize {
    30
}

#[derive(Debug, Deserialize)]
pub struct ImageEntryRaw {
    pub url: String,
    pub filename: String,
    #[serde(default)]
    pub no_descramble: bool,
}

/// 任务状态
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Downloading,
    Completed,
    Failed,
}

/// 任务运行时状态
#[derive(Debug, Clone, Serialize)]
pub struct TaskState {
    pub task_id: String,
    pub status: TaskStatus,
    pub done: u32,
    pub total: u32,
    pub failed: Vec<String>,
    /// 任务完成时间（用于过期淡汰）
    #[serde(skip)]
    pub finished_at: Option<Instant>,
}

/// 全局应用状态
pub struct AppState {
    pub client: reqwest::Client,
    pub semaphore: Arc<Semaphore>,
    /// 反混淆并发信号量；None 表示不限制
    pub decode_semaphore: Option<Arc<Semaphore>>,
    pub tasks: DashMap<String, TaskState>,
    pub config: Config,
    pub start_time: Instant,
}

impl AppState {
    pub fn new(config: &Config) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::ACCEPT,
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::REFERER,
                    "https://18comic.vip/".parse().unwrap(),
                );
                headers
            })
            .timeout(Duration::from_secs(config.timeout_secs))
            .pool_max_idle_per_host(config.max_concurrency)
            .build()
            .expect("failed to build HTTP client");

        Self {
            client,
            semaphore: Arc::new(Semaphore::new(config.max_concurrency)),
            decode_semaphore: if config.decode_concurrency == 0 {
                None
            } else {
                Some(Arc::new(Semaphore::new(config.decode_concurrency)))
            },
            tasks: DashMap::new(),
            config: config.clone(),
            start_time: Instant::now(),
        }
    }

    pub fn active_tasks(&self) -> usize {
        self.tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Downloading || t.status == TaskStatus::Queued)
            .count()
    }
}

/// 异步执行下载任务（tokio::spawn 调用）
pub async fn execute_download(state: Arc<AppState>, req: DownloadRequest) {
    let task_id = req.task_id.clone();

    // 注册任务
    state.tasks.insert(
        task_id.clone(),
        TaskState {
            task_id: task_id.clone(),
            status: TaskStatus::Downloading,
            done: 0,
            total: req.images.len() as u32,
            failed: vec![],
            finished_at: None,
        },
    );

    let images: Vec<ImageEntry> = req
        .images
        .into_iter()
        .map(|i| ImageEntry {
            url: i.url,
            filename: i.filename,
            no_descramble: i.no_descramble,
        })
        .collect();

    let scramble_id: u64 = req.scramble_id.parse().unwrap_or(220980);
    let aid: u64 = req.aid.parse().unwrap_or(0);

    let retry_config = RetryConfig {
        max_retries: state.config.retry_times,
        jitter_cap_ms: state.config.jitter_cap_ms,
    };

    let callback_url = req.callback_url.clone();
    let state_clone = state.clone();
    let tid = task_id.clone();

    // 进度节流：每 3s 或每 10% 上报
    let mut last_report = Instant::now();
    let mut last_pct = 0u32;

    let result = download_chapter(
        &state.client,
        &retry_config,
        &state.semaphore,
        state.decode_semaphore.as_ref(),
        &req.save_dir,
        scramble_id,
        aid,
        &images,
        req.concurrency,
        |done, total| {
            let now = Instant::now();
            let pct = (done * 100).checked_div(total).unwrap_or(100);
            if now.duration_since(last_report) >= Duration::from_secs(3) || pct - last_pct >= 10 {
                last_report = now;
                last_pct = pct;
                if let Some(mut t) = state_clone.tasks.get_mut(&tid) {
                    t.done = done;
                }
                if let Some(url) = &callback_url {
                    let url = url.clone();
                    let tid2 = tid.clone();
                    let client = state_clone.client.clone();
                    tokio::spawn(async move {
                        send_progress(&client, &url, &tid2, done, total, &[], "downloading").await;
                    });
                }
            }
        },
    )
    .await;

    // 最终状态
    let final_status = if result.failed.is_empty() {
        TaskStatus::Completed
    } else {
        TaskStatus::Failed
    };

    // 失败时根据配置决定是否清理已下载的不完整文件
    if final_status == TaskStatus::Failed && state.config.cleanup_on_failure {
        let dir = &req.save_dir;
        match tokio::fs::remove_dir_all(dir).await {
            Ok(()) => info!("已清理失败任务目录: {dir}"),
            Err(e) => warn!("清理目录失败 {dir}: {e}"),
        }
    }

    if let Some(mut t) = state.tasks.get_mut(&task_id) {
        t.status = final_status.clone();
        t.done = result.success;
        t.failed = result.failed.clone();
        t.finished_at = Some(Instant::now());
    }

    // 最终回调
    if let Some(url) = &callback_url {
        let status_str = if final_status == TaskStatus::Completed {
            "completed"
        } else {
            "failed"
        };
        send_progress(
            &state.client,
            url,
            &task_id,
            result.success,
            result.total,
            &result.failed,
            status_str,
        )
        .await;
    }

    info!(
        "任务完成 {}: {}/{} 成功, {} 失败",
        task_id,
        result.success,
        result.total,
        result.failed.len()
    );
}
