import { apiClient } from './client'

/** C1 提交爬取响应。 */
export interface CrawlSubmitResponse {
  status: string
  message: string
  task_id: string
}

/** Celery 任务进度（PROGRESS 状态下的 meta）。 */
export interface CrawlProgress {
  current: number
  total: number
  photo_id: string
}

/** Celery 任务状态枚举（其余状态以 string 兜底）。 */
export type CrawlState =
  | 'PENDING'
  | 'STARTED'
  | 'RETRY'
  | 'PROGRESS'
  | 'SUCCESS'
  | 'FAILURE'
  | 'REVOKED'

/** C2 任务状态响应。 */
export interface CrawlTaskStatus {
  task_id: string
  state: CrawlState | string
  progress?: CrawlProgress
  result?: string
  error?: string
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
