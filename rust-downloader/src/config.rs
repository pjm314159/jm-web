use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: String,
    pub redis_url: String,
    pub media_root: String,
    pub max_concurrency: usize,
    pub retry_times: u32,
    pub jitter_cap_ms: u64,
    pub timeout_secs: u64,
    pub scan_interval_secs: u64,
    /// 失败时是否清理已下载的不完整文件（默认 true）
    pub cleanup_on_failure: bool,
    /// 已完成/失败任务在内存中保留多久（秒），超过后自动淡汰（默认 3600）
    pub task_retention_secs: u64,
    /// 最大排队任务数，超过后拒绝新任务（默认 200）
    pub max_queued_tasks: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            listen_addr: env_or("LISTEN_ADDR", "0.0.0.0:3080"),
            redis_url: env_or("REDIS_URL", "redis://127.0.0.1:6379/0"),
            media_root: env_or("MEDIA_ROOT", "./media"),
            max_concurrency: env_or("MAX_CONCURRENCY", "50").parse().unwrap_or(50),
            retry_times: env_or("RETRY_TIMES", "5").parse().unwrap_or(5),
            jitter_cap_ms: env_or("JITTER_CAP_MS", "2000").parse().unwrap_or(2000),
            timeout_secs: env_or("TIMEOUT_SECS", "30").parse().unwrap_or(30),
            scan_interval_secs: env_or("SCAN_INTERVAL_SECS", "60").parse().unwrap_or(60),
            cleanup_on_failure: env_or("CLEANUP_ON_FAILURE", "true") != "false",
            task_retention_secs: env_or("TASK_RETENTION_SECS", "3600")
                .parse()
                .unwrap_or(3600),
            max_queued_tasks: env_or("MAX_QUEUED_TASKS", "200").parse().unwrap_or(200),
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}
