# API 文档

> 基础路径：`/api`（前端经 `VITE_API_BASE` 配置，默认 `/api`）
> 认证方式：JWT Bearer Token（SimpleJWT，HS256）
> 数据格式：全部为 JSON（无文件上传端点；视频流端点除外）

## 全局约定

### 认证

除标注 **匿名** 的端点外，所有端点均需在请求头携带：

```
Authorization: Bearer <access_token>
```

- `access` 有效期 **7 天**，`refresh` 有效期 **7 天**
- 刷新时启用旋转 + 拉黑（`ROTATE_REFRESH_TOKENS` / `BLACKLIST_AFTER_ROTATION`）：
  刷新成功后返回**新的 refresh**，旧 refresh 立即失效
- 登出会将 refresh token 拉黑

### 限流

全局匿名限流 `30/min`（`AnonRateThrottle`），**仅对匿名请求生效**（注册、登录等）。
超限返回 `429`。

### 分页

两种分页形态并存：

| 形态 | 使用端点 | 结构 |
|---|---|---|
| DRF 标准分页 | `GET /api/library/albums/` | `{count, next, previous, results}` |
| 自定义分页 | 搜索 / 收藏 / 阅读器等 | 各端点内嵌 `pagination` 或分页字段 |

### 错误响应（无统一结构，三种形态并存）

| 形态 | 来源 | 示例 |
|---|---|---|
| `{"error": "中文消息"}` | 业务逻辑错误，400/404/502 | `{"error": "无效链接或ID"}` |
| `{"字段名": ["消息"]}` | DRF serializer 校验错误 | `{"username": ["此字段是必填项。"]}` |
| `{"detail": "..."}` | SimpleJWT / DRF 默认 | `{"detail": "凭据未通过验证。"}` |

### 媒体 URL

图片 / 封面均为相对路径，形如 `/media/images/jmcomic/<album>/<photo>/xx.jpg`，
由 nginx（生产）或 Django（开发）提供静态服务。URL 各段做了百分号编码。

---

## 一、认证 `/api/auth/`

### 1.1 注册

```
POST /api/auth/register/        （匿名）
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `username` | string | 是 | ≤150 字符，不区分大小写唯一 |
| `password` | string | 是 | Django 密码强度校验 |
| `password2` | string | 是 | 须与 password 一致 |
| `secret_key` | string | 是 | 注册邀请码，须等于服务端 `REGISTRATION_SECRET_KEY` |

成功 `201`（注册即自动登录，直接签发 JWT）：

```json
{"access": "...", "refresh": "...", "username": "alice"}
```

失败 `400`：serializer 字段错误格式。

### 1.2 登录

```
POST /api/auth/token/           （匿名）
```

```json
{"username": "alice", "password": "..."}
```

成功 `200`：

```json
{"access": "...", "refresh": "..."}
```

失败 `401`：`{"detail": "No active account found with the given credentials"}`

### 1.3 刷新

```
POST /api/auth/token/refresh/   （匿名，凭 refresh token 本身认证）
```

```json
{"refresh": "<旧 refresh>"}
```

成功 `200`：`{"access": "...", "refresh": "..."}`（refresh 已旋转，旧 refresh 拉黑）。

> ⚠️ 客户端必须保存**返回的新 refresh** 用于下次刷新；旧 refresh 已被拉黑。

### 1.4 登出

```
POST /api/auth/logout/          （需要 JWT）
```

```json
{"refresh": "<要拉黑的 refresh>"}
```

成功：**`205 Reset Content`，无 body**。
失败 `400`：`{"detail": "缺少 refresh token。"}` / `{"detail": "refresh token 无效。"}`

---

## 二、藏书阁 `/api/library/`

### 2.1 本子列表（本地搜索）

```
GET /api/library/albums/?page=1
```

| Query 参数 | 类型 | 说明 |
|---|---|---|
| `page` | int | 页码（30 条/页） |
| `q` | string | 名称/作者模糊搜索 |
| `tags` | string | 逗号分隔多个 tag，**交集**筛选 |
| `authors` | string | 逗号分隔多个作者筛选 |

无筛选参数时返回"至少含一个已下载章节"的本子，按更新时间倒序。

成功 `200`（DRF 标准分页，`results` 元素结构）：

```json
{
  "count": 42, "next": "http://...?page=2", "previous": null,
  "results": [{
    "id": 1,
    "jm_id": "123456",
    "name": "...",
    "author": "...",
    "tags": ["..."],
    "cover_url": "/media/images/jmcomic/.../00000.jpg",
    "total_episodes": 10,
    "downloaded_episodes": 8,
    "created_at": "2026-01-01T00:00:00Z"
  }]
}
```

> 注意：`id` 是本地数据库主键，`jm_id` 才是 JM 站点 ID，两者不要混用。

### 2.2 本子详情

```
GET /api/library/albums/{id}/   （id 为本地主键）
```

成功 `200`：列表字段之外附加：

```json
{
  "description": "...",
  "actors": ["..."],
  "photos": [{
    "id": 1, "jm_id": "123456_01", "name": "第1话",
    "sort_index": 0, "is_downloaded": true, "save_path": "..."
  }]
}
```

失败 `404`：`{"detail": "未找到。"}`

### 2.3 删除本子

```
DELETE /api/library/albums/{id}/
```

行为：物理删除媒体文件夹 + 清除 Redis 章节缓存 + 删除 DB 记录（级联删章节）。
成功 `204`，无 body。

### 2.4 检测更新

```
POST /api/library/albums/{id}/check-updates/
```

行为：**同步**拉取远端章节列表与本地求差集（可能较慢）。

成功 `200`：

```json
{
  "has_updates": true,
  "new_episodes": [{"photo_id": "123456_11", "index": 10, "name": "第11话"}],
  "new_count": 1,
  "local_count": 10,
  "remote_count": 11
}
```

失败 `502`：`{"error": "检测失败: ..."}`

### 2.5 / 2.6 本地 tag / 作者聚合

```
GET /api/library/albums/tags/?limit=10        → {"tags": [{"tag": "...", "count": 3}]}
GET /api/library/albums/authors/?limit=10     → {"authors": [{"author": "...", "count": 2}]}
```

- 带 `q` 时返回所有匹配项（不限数量）；否则返回频次 top `limit`（默认 10）

### 2.7 本地阅读器

```
GET /api/library/photos/{pk}/?page=1
```

| Query | 说明 |
|---|---|
| `page` | 页码，300 图/页 |
| `target` | 可选，按目标图片序号反推页码 |

成功 `200`：

```json
{
  "photo_id": 1, "name": "第1话", "album_id": 1,
  "images": ["/media/...jpg"],
  "total_images": 450, "current_start_index": 0,
  "page": 1, "total_pages": 2, "images_per_page": 300, "target": null,
  "prev_photo_id": null, "next_photo_id": 2
}
```

失败 `404`：`{"error": "章节不存在"}`

---

## 三、爬取 `/api/crawl/`（异步任务）

**异步语义**：提交接口"受理即返回"（202），实际下载由 Rust 下载微服务异步执行；
任务状态存 Redis（TTL 24h），通过 3.2 / 3.3 轮询；下载完成由 Rust 服务回调写库。

```
┌────────┐ 1. POST /api/crawl/ (202)   ┌────────┐ 3. POST /api/crawl/callback/
│  前端  │ ─────────────────────────→  │ Django │ ←────────────── Rust 服务
│        │ 2. 轮询 tasks/{id}/         │        │ 2'. 并发下发下载任务
└────────┘ ←───────────────────────── └────────┘ ──────────────────────────→
```

### 3.1 提交爬取

```
POST /api/crawl/
```

```json
{"input": "123456"}
```

`input` 支持：纯数字 JM ID、含 `/album/{id}` 或 `/photo/{id}` 的链接。

成功 `202 Accepted`：

```json
{
  "status": "success",
  "task_id": "a1b2c3d4e5f6",
  "crawl_id": "a1b2c3d4e5f6",
  "chapters": 10,
  "submitted": 8,
  "message": "..."
}
```

> `task_id` 即 `crawl_id`，用于后续轮询。已下载章节自动跳过，`submitted` < `chapters` 属正常。

失败：`400` `{"error": "无效链接或ID"}`；`502` `{"error": "提交失败: ..."}`

### 3.2 任务进度

```
GET /api/crawl/tasks/{task_id}/
```

成功 `200`：

```json
{
  "crawl_id": "a1b2c3d4e5f6",
  "state": "DOWNLOADING",
  "progress": {
    "chapters_done": 3, "chapters_total": 10,
    "images_done": 120, "images_total": 450
  },
  "album_id": 1
}
```

- `state`：`DOWNLOADING` | `PROGRESS` | `SUCCESS` | `PARTIAL` | `FAILED` | `UNKNOWN`
- `album_id` 仅在 `SUCCESS` / `PARTIAL` 且本地有记录时返回
- 任务不存在 / 已过期：`{"crawl_id": "...", "state": "UNKNOWN", "error": "任务不存在或已过期"}`（无 progress）

### 3.3 进行中任务列表

```
GET /api/crawl/tasks/
```

成功 `200`：

```json
{
  "tasks": [{
    "crawl_id": "...", "jm_id": "123456", "jm_type": "album",
    "state": "DOWNLOADING", "progress": {"chapters_done": 0, "chapters_total": 0,
                                          "images_done": 0, "images_total": 0}
  }],
  "count": 1
}
```

Rust 服务不可达时仍返回 `200`：`{"tasks": [], "count": 0, "error": "下载服务不可达"}`。

---

## 四、在线搜索 `/api/search/`

搜索、详情、章节、评论结果均有 Redis 缓存（120s，评论 60s）。

### 4.1 搜索 / 排行

```
GET /api/search/?q=关键词&type=keyword&page=1&order_by=mr&time=a&category=0
```

| Query | 默认 | 说明 |
|---|---|---|
| `q` | `""` | 关键词 / 标签名 / 作者名 |
| `type` | `keyword` | `keyword` \| `tag` \| `author` \| `rank` |
| `page` | `1` | |
| `order_by` | `mr` | `mr`最新 `mv`浏览 `mp`图片 `tf`喜欢 `tr`评分 `md`评论 `mv_m/mv_w/mv_t`月/周/日榜；非法值回退 `mr` |
| `time` | `a` | `t`今天 `w`本周 `m`本月 `a`全部 |
| `category` | `0` | `doujin` `single` `short` `another` `hanman` `meiman` `doujin_cosplay` `3D` `english_site` |
| `sub_category` | — | `chinese` `japanese` `other` `3d` `cosplay` `CG` `youth` |

成功 `200`（即使上游失败也返回 200，错误置于 `error` 字段）：

```json
{
  "query": "...", "search_type": "keyword",
  "results": [{
    "jm_id": "123456", "name": "...", "author": "...", "tags": ["..."],
    "description": "...", "update_time": "2026-01-01",
    "cover_url": "...", "is_downloaded": false, "category": "..."
  }],
  "pagination": {"current": 1, "total": 100, "page_count": 4,
                 "has_prev": false, "has_next": true, "prev_num": null, "next_num": 2},
  "filters": {"order_by": "mr", "time": "a", "category": "0", "sub_category": null},
  "error": null
}
```

### 4.2 在线详情

```
GET /api/search/albums/{jm_id}/
```

成功 `200`：

```json
{
  "album": {
    "jm_id": "123456", "name": "...", "author": "...", "description": "...",
    "tags": ["..."], "cover_url": "...", "likes": 0, "views": 0, "comments_count": 0,
    "episode_list": [{"photo_id": "123456_01", "index": 0, "name": "第1话"}]
  },
  "is_downloaded": true,
  "local_album_id": 1,
  "has_updates": false,
  "new_episode_count": 0
}
```

失败 `502`：`{"error": "获取详情失败: ..."}`

### 4.3 在线章节列表

```
GET /api/search/albums/{jm_id}/episodes/
→ {"jm_id": "...", "name": "...", "episode_list": [{"photo_id", "index", "name"}]}
```

### 4.4 在线评论

```
GET /api/search/albums/{jm_id}/comments/?page=1
```

成功 `200`：

```json
{
  "jm_id": "...", "page": 1, "total": 10, "page_count": 1, "has_next": false,
  "comments": [{
    "comment_id": "...", "user_id": "...", "username": "...", "nickname": "...",
    "level": 5, "photo": null,
    "badges": [{"name": "...", "url": "..."}],
    "content": "...", "created_at": "...", "likes": 0,
    "is_spoiler": false,
    "replies": []
  }]
}
```

### 4.5 在线阅读器

```
GET /api/search/photos/{photo_id}/images/?page=1
```

成功 `200`：

```json
{
  "photo_id": "123456_01", "album_id": "123456", "scramble_id": 220980,
  "images": [{"url": "https://...jpg", "num": 10, "is_gif": false}],
  "total_images": 30, "current_start_index": 0, "page": 1,
  "total_pages": 1, "images_per_page": 300, "target": null
}
```

> 图片反混淆由前端 WASM 按 `num`（切片数）完成；`is_gif=true` 时 `num=0`（无需处理）。

---

## 五、个人资料 `/api/profile/`

### 5.1 查看关联账号

```
GET /api/profile/
→ {"linked": true, "account": null | {
     "username": "...", "uid": "...", "avatar": "...", "email": "...",
     "level_name": "...", "album_favorites": 0, "coin": "0",
     "linked_at": "2026-01-01T00:00:00Z" }}
```

### 5.2 关联 JM 账号

```
POST /api/profile/link/
{"username": "...", "password": "..."}
```

成功 `200`：`{"account": {...}}`。密码经 Fernet 加密后存库。
失败 `400`：`{"error": "用户名和密码不能为空" | "账号或密码错误" | "登录失败: ..."}`

### 5.3 解除关联

```
POST /api/profile/unlink/
→ {"ok": true}
```

### 5.4 收藏夹

```
GET /api/profile/favorites/?page=1
```

> ⚠️ 首次调用会登录 JM 并聚合拉取全部收藏页（最多 50 页，结果缓存 120s），**可能很慢**；
> 本地按 20 条/页分页。

成功 `200`：

```json
{
  "current": 1, "total": 35, "page_count": 2, "has_prev": false,
  "has_next": true, "prev_num": null, "next_num": 2,
  "albums": [{"album_id": "...", "title": "...", "cover_url": "...", "is_downloaded": false}]
}
```

失败 `400`：`{"error": "尚未关联账号"}`

---

## 六、本地媒体 `/api/local/`

扫描 `MEDIA_ROOT/images/local/`（图片文件夹）与 `MEDIA_ROOT/videos/`（视频文件夹），结果缓存。

### 6.1 文件夹列表

```
GET /api/local/media/
```

成功 `200`：

```json
{
  "image_albums": [{
    "name": "...", "count": 20, "cover_url": "/media/...",
    "preview_urls": ["/media/..."], "folder_name": "..."
  }],
  "video_folders": [{"name": "...", "count": 3, "cover_url": null, "folder_name": "..."}]
}
```

### 6.2 刷新（清缓存重扫）

```
POST /api/local/media/refresh/    → 响应结构同 6.1
```

### 6.3 本地图片分页

```
GET /api/local/images/{folder_name}/?page=1&jump=50
```

| Query | 说明 |
|---|---|
| `page` | 页码，300 图/页 |
| `jump` | 可选，按图片序号跳页 |

成功 `200`：

```json
{
  "folder_name": "...",
  "files": [{"name": "001.jpg", "url": "/media/images/local/.../001.jpg"}],
  "count": 300, "start_index": 0, "total_pages": 2, "current_page": 1,
  "target_jump_index": null
}
```

失败 `404`：`{"error": "文件夹不存在"}`

### 6.4 视频列表

```
GET /api/local/videos/{folder_name}/
→ {"folder_name": "...", "files": [{"name": "...", "url": "..."}],
   "count": 3, "first_video": {"name": "...", "url": "..."} | null}
```

### 6.5 视频流播放

```
GET /api/local/stream/{folder_name}/{file_name}/
```

**返回视频二进制流而非 JSON**，支持 HTTP Range（`206 Partial Content` / `416`）：

- 生产：返回 `X-Accel-Redirect` 头由 nginx 直出（响应体为空）
- 开发：`FileResponse` + Range 解析

路径已做遍历防护（解析后必须位于 videos 目录内），失败 `404`：`{"error": "视频文件不存在"}`

> 注：前端本地视频播放目前直接走 `/media/` 静态路径，未使用此端点。

---

## 七、内部接口 `/api/crawl/callback/`（Rust → Django）

```
POST /api/crawl/callback/
X-Internal-Token: <INTERNAL_CALLBACK_TOKEN>   （服务端配置了密钥时必带）
```

**无需 JWT**（Rust 服务内部调用），已豁免匿名限流。

安全约定：服务端配置了 `INTERNAL_CALLBACK_TOKEN` 时，请求头 `X-Internal-Token` 必须
与之匹配，否则返回 `403`；未配置时不校验（仅限本地开发环境）。

```json
{"task_id": "...", "status": "completed"}
```

| 字段 | 说明 |
|---|---|
| `task_id` | 必填，章节下载任务 ID |
| `status` | `completed` / `failed` |

行为：`completed` → 标记章节 `is_downloaded`、写 `save_path`、更新封面、清搜索缓存；`failed` → 仅记日志。

响应：`200` + `{"ok": true}`；缺 `task_id` 时返回 `200` + `{"ok": false, "error": "missing task_id"}`。

---

## 附录：前端调用约定

- **客户端**：axios 单例（`frontend/src/api/client.ts`），`baseURL = VITE_API_BASE || '/api'`
- **Token 存储**：localStorage（`jm-access-token` / `jm-refresh-token` / `jm-username`）
- **自动附加**：请求拦截器自动加 `Authorization: Bearer <access>`
- **401 自动刷新**：响应拦截器遇 401 自动用 refresh 换新 access 并重放请求（并发排队防抖）；
  `/auth/` 路径的 401 不触发刷新
- **错误提示**：前端统一兼容上文三种错误结构（`apiError.ts`）
