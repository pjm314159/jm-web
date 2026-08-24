use std::path::Path;

use redis::AsyncCommands;
use serde::Serialize;
use tracing::{info, warn};

const IMAGE_EXTS: &[&str] = &[".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const VIDEO_EXTS: &[&str] = &[
    ".mp4", ".webm", ".mov", ".mkv", ".avi", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg",
];

#[derive(Debug, Clone, Serialize)]
struct FolderInfo {
    name: String,
    count: usize,
    cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview_urls: Option<Vec<String>>,
    folder_name: String,
}

#[derive(Debug, Clone, Serialize)]
struct FileEntry {
    name: String,
    url: String,
}

#[derive(Debug, Clone, Serialize)]
struct MediaFolders {
    image_albums: Vec<FolderInfo>,
    video_folders: Vec<FolderInfo>,
}

/// 自然排序（数字部分按数值比较）
fn natural_sort_key(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_number = false;

    for c in s.chars() {
        if c.is_ascii_digit() {
            if !in_number {
                if !current.is_empty() {
                    parts.push(current.clone());
                    current.clear();
                }
                in_number = true;
            }
            current.push(c);
        } else {
            if in_number {
                parts.push(format!("{:0>20}", current));
                current.clear();
                in_number = false;
            }
            current.push(c.to_ascii_lowercase());
        }
    }
    if !current.is_empty() {
        if in_number {
            parts.push(format!("{:0>20}", current));
        } else {
            parts.push(current);
        }
    }
    parts
}

/// RFC 3986 路径段百分号编码（保留 unreserved 字符），与 Django build_media_url 对齐。
fn url_encode_segment(s: &str) -> String {
    let mut out = String::new();
    for byte in s.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn is_media_file(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .map(|ext| exts.contains(&format!(".{}", ext.to_string_lossy().to_lowercase()).as_str()))
        .unwrap_or(false)
}

/// 扫描本地媒体目录，写入 Redis（复用单连接）。
pub async fn scan_local_media(media_root: &str, redis_url: &str, key_prefix: &str) {
    let base = Path::new(media_root);
    let media_url = "/media/";

    // 建立单一 Redis 连接，全程复用
    let redis_client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            warn!("Redis 客户端创建失败: {e}");
            return;
        }
    };
    let mut con = match redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            warn!("Redis 连接失败: {e}");
            return;
        }
    };

    let mut image_albums: Vec<FolderInfo> = Vec::new();
    let mut video_folders: Vec<FolderInfo> = Vec::new();

    // 扫描图片目录: media/images/local/
    let local_images = base.join("images").join("local");
    if local_images.exists() {
        if let Ok(entries) = std::fs::read_dir(&local_images) {
            let mut folders: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .collect();
            folders.sort_by_key(|e| e.file_name());

            for entry in folders {
                let folder = entry.path();
                let folder_name = folder.file_name().unwrap().to_string_lossy().to_string();

                let mut files: Vec<_> = std::fs::read_dir(&folder)
                    .map(|rd| {
                        rd.filter_map(|e| e.ok())
                            .filter(|e| e.path().is_file() && is_media_file(&e.path(), IMAGE_EXTS))
                            .collect()
                    })
                    .unwrap_or_default();

                files.sort_by_key(|e| natural_sort_key(&e.file_name().to_string_lossy()));

                let count = files.len();
                let preview_urls: Vec<String> = files
                    .iter()
                    .take(3)
                    .map(|f| {
                        let name = f.file_name().to_string_lossy().into_owned();
                        format!(
                            "{media_url}images/local/{}/{}",
                            url_encode_segment(&folder_name),
                            url_encode_segment(&name)
                        )
                    })
                    .collect();
                let cover_url = preview_urls.first().cloned();

                image_albums.push(FolderInfo {
                    name: folder_name.clone(),
                    count,
                    cover_url,
                    preview_urls: Some(preview_urls),
                    folder_name: folder_name.clone(),
                });

                // 写入单文件夹缓存（复用连接）
                let files_list: Vec<FileEntry> = files
                    .iter()
                    .map(|f| FileEntry {
                        name: f.file_name().to_string_lossy().into_owned(),
                        url: {
                            let name = f.file_name().to_string_lossy().into_owned();
                            format!(
                                "{media_url}images/local/{}/{}",
                                url_encode_segment(&folder_name),
                                url_encode_segment(&name)
                            )
                        },
                    })
                    .collect();

                let key = format!("{key_prefix}jmw-local-images-{folder_name}");
                let _: Result<(), _> = con
                    .set(&key, serde_json::to_string(&files_list).unwrap_or_default())
                    .await;
            }
        }
    }

    // 扫描视频目录: media/videos/
    let local_videos = base.join("videos");
    if local_videos.exists() {
        if let Ok(entries) = std::fs::read_dir(&local_videos) {
            let mut folders: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .collect();
            folders.sort_by_key(|e| e.file_name());

            for entry in folders {
                let folder = entry.path();
                let folder_name = folder.file_name().unwrap().to_string_lossy().to_string();

                let mut video_files: Vec<_> = std::fs::read_dir(&folder)
                    .map(|rd| {
                        rd.filter_map(|e| e.ok())
                            .filter(|e| e.path().is_file() && is_media_file(&e.path(), VIDEO_EXTS))
                            .collect()
                    })
                    .unwrap_or_default();

                video_files.sort_by_key(|e| natural_sort_key(&e.file_name().to_string_lossy()));

                // 封面：优先 cover.* 图片
                let cover_url = std::fs::read_dir(&folder)
                    .map(|rd| {
                        rd.filter_map(|e| e.ok())
                            .filter(|e| e.path().is_file() && is_media_file(&e.path(), IMAGE_EXTS))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default()
                    .into_iter()
                    .find(|e| {
                        e.path()
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_lowercase() == "cover")
                            .unwrap_or(false)
                    })
                    .map(|f| {
                        let name = f.file_name().to_string_lossy().into_owned();
                        format!(
                            "{media_url}videos/{}/{}",
                            url_encode_segment(&folder_name),
                            url_encode_segment(&name)
                        )
                    });

                video_folders.push(FolderInfo {
                    name: folder_name.clone(),
                    count: video_files.len(),
                    cover_url,
                    preview_urls: None,
                    folder_name: folder_name.clone(),
                });

                let files_list: Vec<FileEntry> = video_files
                    .iter()
                    .map(|f| FileEntry {
                        name: f.file_name().to_string_lossy().into_owned(),
                        url: {
                            let name = f.file_name().to_string_lossy().into_owned();
                            format!(
                                "{media_url}videos/{}/{}",
                                url_encode_segment(&folder_name),
                                url_encode_segment(&name)
                            )
                        },
                    })
                    .collect();

                let key = format!("{key_prefix}jmw-local-videos-{folder_name}");
                let _: Result<(), _> = con
                    .set(&key, serde_json::to_string(&files_list).unwrap_or_default())
                    .await;
            }
        }
    }

    // 写入总缓存（复用连接）
    let context = MediaFolders {
        image_albums,
        video_folders,
    };

    let json = serde_json::to_string(&context).unwrap_or_default();
    let media_key = format!("{key_prefix}jmw-local-media-folders");
    let result: Result<(), redis::RedisError> = con.set(media_key, json).await;
    match result {
        Ok(_) => info!("本地媒体扫描完成并写入 Redis"),
        Err(e) => warn!("Redis SET 失败: {e}"),
    }
}

/// 启动定时扫描调度器
pub async fn start_scheduler(
    redis_url: String,
    media_root: String,
    interval_secs: u64,
    key_prefix: String,
) {
    use tokio_cron_scheduler::{Job, JobScheduler};

    let sched = JobScheduler::new()
        .await
        .expect("failed to create scheduler");

    let redis_url2 = redis_url.clone();
    let media_root2 = media_root.clone();
    let key_prefix2 = key_prefix.clone();

    let job = Job::new_async(
        format!("*/{interval_secs} * * * * *").as_str(),
        move |_uuid, _lock| {
            let redis_url = redis_url2.clone();
            let media_root = media_root2.clone();
            let key_prefix = key_prefix2.clone();
            Box::pin(async move {
                scan_local_media(&media_root, &redis_url, &key_prefix).await;
            })
        },
    )
    .expect("failed to create scan job");
    sched.add(job).await.expect("failed to add scan job");

    // 启动时立即执行一次
    let redis_url3 = redis_url.clone();
    let media_root3 = media_root.clone();
    let key_prefix3 = key_prefix.clone();
    tokio::spawn(async move {
        info!("启动时执行初始媒体扫描");
        scan_local_media(&media_root3, &redis_url3, &key_prefix3).await;
    });

    sched.start().await.expect("failed to start scheduler");
    info!("定时扫描调度器已启动，间隔 {interval_secs}s");

    // 保持调度器运行
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_encode_segment() {
        assert_eq!(url_encode_segment("1.jpg"), "1.jpg");
        assert_eq!(
            url_encode_segment("测试 相册[A]"),
            "%E6%B5%8B%E8%AF%95%20%E7%9B%B8%E5%86%8C%5BA%5D"
        );
        assert_eq!(url_encode_segment("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[test]
    fn test_is_media_file_avif() {
        assert!(is_media_file(Path::new("cover.avif"), IMAGE_EXTS));
        assert!(is_media_file(Path::new("cover.AVIF"), IMAGE_EXTS));
        assert!(is_media_file(Path::new("cover.gif"), IMAGE_EXTS));
        assert!(!is_media_file(Path::new("cover.txt"), IMAGE_EXTS));
    }
}
