import { apiClient } from './client'

/** C1 提交爬取响应。 */
export interface CrawlSubmitResponse {
  status: string
  message: string
  task_id: string
}

/** 爬取进度（Rust 下载服务状态聚合）。 */
export interface CrawlProgress {
  chapters_done: number
  chapters_total: number
  images_done: number
  images_total: number
}

/** 任务状态枚举。 */
export type CrawlState =
  | 'DOWNLOADING'
  | 'PROGRESS'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'UNKNOWN'

/** C2 任务状态响应。 */
export interface CrawlTaskStatus {
  crawl_id: string
  state: CrawlState | string
  progress?: CrawlProgress
  error?: string
  /** 完成时返回本地 Album DB 主键，用于跳转本地详情页 */
  album_id?: number
}

/** C1：提交爬取任务（POST /api/crawl/），返回 task_id。 */
export async function submitCrawl(input: string): Promise<CrawlSubmitResponse> {
  const { data } = await apiClient.post<CrawlSubmitResponse>('/crawl/', { input })
  return data
}

/** C2：查询 Celery 任务状态（GET /api/crawl/tasks/<task_id>/）。 */
export async function getCrawlTaskStatus(taskId: string): Promise<CrawlTaskStatus> {
  const { data } = await apiClient.get<CrawlTaskStatus>(`/crawl/tasks/${taskId}/`)
  return data
}

/** C2+ 列表项：仍在下载中的任务。 */
export interface CrawlTaskSummary {
  crawl_id: string
  jm_id: string
  jm_type: 'album' | 'photo'
  state: 'DOWNLOADING' | 'PROGRESS'
  progress: {
    chapters_done: number
    chapters_total: number
    images_done: number
    images_total: number
  }
}

/** C2+ 响应：全部进行中的下载。 */
export interface CrawlTasksResponse {
  tasks: CrawlTaskSummary[]
  count: number
  error?: string
}

/** C2+：列出所有仍在下载中的任务（GET /api/crawl/tasks/）。 */
export async function getCrawlTasks(): Promise<CrawlTasksResponse> {
  const { data } = await apiClient.get<CrawlTasksResponse>('/crawl/tasks/')
  return data
}
