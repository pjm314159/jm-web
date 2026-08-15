use std::env;
use std::path::PathBuf;

use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: String,
    pub redis_url: String,
    /// Redis key 前缀（需与 Django 缓存 KEY_PREFIX:version 一致，默认 jmw:1:）
    pub redis_key_prefix: String,
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
    /// 反混淆最大并发数（默认 10，0 = 不限制）
    pub decode_concurrency: usize,
    /// 图片下载代理（可选；为空/未配置则直连）
    pub proxy: Option<String>,
}

/// config.toml 文件结构（所有字段可选，缺省使用代码默认值）
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct FileConfig {
    server: ServerConfig,
    redis: RedisConfig,
    storage: StorageConfig,
    download: DownloadConfig,
    task: TaskConfig,
    scanner: ScannerConfig,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ServerConfig {
    listen_addr: Option<String>,
    log_level: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RedisConfig {
    url: Option<String>,
    key_prefix: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct StorageConfig {
    media_root: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct DownloadConfig {
    max_concurrency: Option<usize>,
    timeout_secs: Option<u64>,
    retry_times: Option<u32>,
    jitter_cap_ms: Option<u64>,
    decode_concurrency: Option<usize>,
    proxy: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct TaskConfig {
    cleanup_on_failure: Option<bool>,
    retention_secs: Option<u64>,
    max_queued: Option<usize>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ScannerConfig {
    interval_secs: Option<u64>,
}

impl Config {
    /// 加载配置：config.toml（可选）+ 环境变量覆盖（环境变量优先级最高）。
    ///
    /// 配置文件查找顺序：
    /// 1. 命令行参数 `--config <path>` / `--config=<path>`
    /// 2. 环境变量 `JM_CONFIG_FILE`
    /// 3. 可执行文件同目录下的 `config.toml`
    pub fn load() -> Self {
        let file = load_file_config();
        let mut config = Config {
            listen_addr: file
                .server
                .listen_addr
                .unwrap_or_else(|| "0.0.0.0:3080".to_string()),
            redis_url: file
                .redis
                .url
                .unwrap_or_else(|| "redis://127.0.0.1:6379/0".to_string()),
            redis_key_prefix: file
                .redis
                .key_prefix
                .unwrap_or_else(|| "jmw:1:".to_string()),
            media_root: file
                .storage
                .media_root
                .unwrap_or_else(|| "./media".to_string()),
            max_concurrency: file.download.max_concurrency.unwrap_or(50),
            retry_times: file.download.retry_times.unwrap_or(5),
            jitter_cap_ms: file.download.jitter_cap_ms.unwrap_or(2000),
            timeout_secs: file.download.timeout_secs.unwrap_or(30),
            scan_interval_secs: file.scanner.interval_secs.unwrap_or(60),
            cleanup_on_failure: file.task.cleanup_on_failure.unwrap_or(true),
            task_retention_secs: file.task.retention_secs.unwrap_or(3600),
            max_queued_tasks: file.task.max_queued.unwrap_or(200),
            decode_concurrency: file.download.decode_concurrency.unwrap_or(10),
            proxy: file.download.proxy.clone(),
        };

        // 环境变量覆盖（值无效时回退到文件/默认值）
        config.listen_addr = env_or("LISTEN_ADDR", &config.listen_addr);
        config.redis_url = env_or("REDIS_URL", &config.redis_url);
        if let Ok(prefix) = env::var("REDIS_KEY_PREFIX") {
            let prefix = prefix.trim();
            if !prefix.is_empty() {
                config.redis_key_prefix = prefix.to_string();
            }
        }
        config.media_root = env_or("MEDIA_ROOT", &config.media_root);
        config.max_concurrency = env_or("MAX_CONCURRENCY", &config.max_concurrency.to_string())
            .parse()
            .unwrap_or(config.max_concurrency);
        config.retry_times = env_or("RETRY_TIMES", &config.retry_times.to_string())
            .parse()
            .unwrap_or(config.retry_times);
        config.jitter_cap_ms = env_or("JITTER_CAP_MS", &config.jitter_cap_ms.to_string())
            .parse()
            .unwrap_or(config.jitter_cap_ms);
        config.timeout_secs = env_or("TIMEOUT_SECS", &config.timeout_secs.to_string())
            .parse()
            .unwrap_or(config.timeout_secs);
        config.scan_interval_secs =
            env_or("SCAN_INTERVAL_SECS", &config.scan_interval_secs.to_string())
                .parse()
                .unwrap_or(config.scan_interval_secs);
        config.cleanup_on_failure = env_or(
            "CLEANUP_ON_FAILURE",
            if config.cleanup_on_failure {
                "true"
            } else {
                "false"
            },
        ) != "false";
        config.task_retention_secs = env_or(
            "TASK_RETENTION_SECS",
            &config.task_retention_secs.to_string(),
        )
        .parse()
        .unwrap_or(config.task_retention_secs);
        config.max_queued_tasks = env_or("MAX_QUEUED_TASKS", &config.max_queued_tasks.to_string())
            .parse()
            .unwrap_or(config.max_queued_tasks);
        config.decode_concurrency =
            env_or("DECODE_CONCURRENCY", &config.decode_concurrency.to_string())
                .parse()
                .unwrap_or(config.decode_concurrency);
        if let Ok(proxy) = env::var("PROXY") {
            let proxy = proxy.trim();
            config.proxy = if proxy.is_empty() {
                None
            } else {
                Some(proxy.to_string())
            };
        }

        config
    }
}

fn env_or(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn cli_config_path() -> Option<PathBuf> {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--config" {
            return args.next().map(PathBuf::from);
        }
        if let Some(path) = arg.strip_prefix("--config=") {
            return Some(PathBuf::from(path));
        }
    }
    None
}

fn resolve_config_path() -> Option<PathBuf> {
    if let Some(path) = cli_config_path() {
        return Some(path);
    }
    if let Ok(path) = env::var("JM_CONFIG_FILE") {
        let pb = PathBuf::from(path);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let exe_dir = env::current_exe().ok()?.parent()?.to_path_buf();
    let candidate = exe_dir.join("config.toml");
    candidate.is_file().then_some(candidate)
}

fn load_file_config() -> FileConfig {
    let Some(path) = resolve_config_path() else {
        return FileConfig::default();
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("WARN: 读取配置文件失败 {}: {e}", path.display());
            return FileConfig::default();
        }
    };
    match toml::from_str(&content) {
        Ok(config) => config,
        Err(e) => {
            eprintln!("WARN: 解析配置文件失败 {}: {e}，使用默认值", path.display());
            FileConfig::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_file_config() {
        let toml = r#"
[server]
listen_addr = "0.0.0.0:9999"

[redis]
key_prefix = "jmw:1:"

[download]
max_concurrency = 8
decode_concurrency = 0
proxy = "http://127.0.0.1:10808"

[task]
cleanup_on_failure = false
"#;
        let cfg: FileConfig = toml::from_str(toml).unwrap();
        assert_eq!(cfg.server.listen_addr.as_deref(), Some("0.0.0.0:9999"));
        assert_eq!(cfg.redis.key_prefix.as_deref(), Some("jmw:1:"));
        assert_eq!(cfg.download.max_concurrency, Some(8));
        assert_eq!(cfg.download.decode_concurrency, Some(0));
        assert_eq!(
            cfg.download.proxy.as_deref(),
            Some("http://127.0.0.1:10808")
        );
        assert_eq!(cfg.task.cleanup_on_failure, Some(false));
        assert!(cfg.redis.url.is_none());
    }
}
