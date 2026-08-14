mod callback;
mod config;
mod download;
mod retry;
mod scanner;
mod task;

use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tracing::info;

use config::Config;
use task::{AppState, DownloadRequest, TaskStatus};

type SharedState = Arc<AppState>;

/// POST /api/v1/download — 提交下载任务
async fn submit_download(
    State(state): State<SharedState>,
    Json(req): Json<DownloadRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let task_id = req.task_id.clone();

    // 检查是否已存在
    if state.tasks.contains_key(&task_id) {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "task already exists", "task_id": task_id })),
        );
    }

    // 拒绝超过最大排队数
    if state.active_tasks() >= state.config.max_queued_tasks {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "queue full", "max": state.config.max_queued_tasks })),
        );
    }

    let position = state.active_tasks() + 1;

    // 先注册为 queued
    state.tasks.insert(
        task_id.clone(),
        task::TaskState {
            task_id: task_id.clone(),
            status: TaskStatus::Queued,
            done: 0,
            total: req.images.len() as u32,
            failed: vec![],
            finished_at: None,
        },
    );

    // 异步执行
    let state_clone = state.clone();
    tokio::spawn(async move {
        task::execute_download(state_clone, req).await;
    });

    info!("任务已入队: {task_id} (position={position})");
    (
        StatusCode::ACCEPTED,
        Json(json!({ "status": "queued", "position": position })),
    )
}

/// GET /api/v1/download/:task_id/status — 查询任务状态
async fn get_task_status(
    State(state): State<SharedState>,
    axum::extract::Path(task_id): axum::extract::Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    match state.tasks.get(&task_id) {
        Some(t) => (
            StatusCode::OK,
            Json(json!({
                "task_id": t.task_id,
                "status": t.status,
                "done": t.done,
                "total": t.total,
                "failed": t.failed,
            })),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
    }
}

/// GET /api/v1/download/tasks — 全部任务状态（Django 用于聚合“正在下载”列表）
async fn list_tasks(State(state): State<SharedState>) -> Json<serde_json::Value> {
    let tasks = task::task_summaries(&state);
    Json(json!({ "tasks": tasks, "count": tasks.len() }))
}

/// GET /health — 健康检查
async fn health(State(state): State<SharedState>) -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "active_tasks": state.active_tasks(),
        "uptime_secs": state.start_time.elapsed().as_secs(),
    }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::load();
    info!("JM Downloader 启动: {:?}", config);

    let state = Arc::new(AppState::new(&config));

    // 启动定时扫描调度器（后台任务）
    let scan_redis = config.redis_url.clone();
    let scan_media = config.media_root.clone();
    let scan_interval = config.scan_interval_secs;
    tokio::spawn(async move {
        scanner::start_scheduler(scan_redis, scan_media, scan_interval).await;
    });

    // 后台淡汰过期任务（防止 DashMap 无限增长）
    let eviction_state = state.clone();
    let retention = Duration::from_secs(config.task_retention_secs);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let now = std::time::Instant::now();
            eviction_state.tasks.retain(|_, t| {
                t.finished_at
                    .map(|f| now.duration_since(f) < retention)
                    .unwrap_or(true) // 未完成的任务始终保留
            });
        }
    });

    // 构建路由
    let app = Router::new()
        .route("/api/v1/download", post(submit_download))
        .route("/api/v1/download/tasks", get(list_tasks))
        .route("/api/v1/download/{task_id}/status", get(get_task_status))
        .route("/health", get(health))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.listen_addr)
        .await
        .expect("failed to bind");
    info!("监听: {}", config.listen_addr);
    axum::serve(listener, app).await.expect("server error");
}
