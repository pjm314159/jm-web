import { apiClient } from './client'

/**
 * 本地资源 API（对接后端 /api/local/，M1-M2）。
 * 详情页（M3 图片分页 / M4 视频列表 / M5 流式播放）暂未实现，本期仅列表页（design.md L37-40）。
 */

/** 本地图片相册（image_albums 项）。 */
export interface LocalImageAlbum {
  name: string
  count: number
  cover_url: string | null
  /** 堆叠预览：最多前 3 张图片 URL，不足三张时数组更短。 */
  preview_urls: string[]
  folder_name: string
}

/** 本地视频夹（video_folders 项）。 */
export interface LocalVideoFolder {
  name: string
  count: number
  /** 封面：文件夹内 cover.* 或首张图片，无图片则为 null。 */
  cover_url: string | null
  folder_name: string
}

/** M1/M2 响应体。 */
export interface LocalMedia {
  image_albums: LocalImageAlbum[]
  video_folders: LocalVideoFolder[]
}

/** M1：图片/视频文件夹列表（读缓存）。 */
export async function getLocalMedia(): Promise<LocalMedia> {
  const { data } = await apiClient.get<LocalMedia>('/local/media/')
  return data
}

/** M2：清缓存并重新扫描。 */
export async function refreshLocalMedia(): Promise<LocalMedia> {
  const { data } = await apiClient.post<LocalMedia>('/local/media/refresh/')
  return data
}

/** M3 本地图片项。 */
export interface LocalImageFile {
  name: string
  url: string
}

/** M3 本地图片分页响应（300 图/页）。 */
export interface LocalImagesResponse {
  folder_name: string
  files: LocalImageFile[]
  count: number
  start_index: number
  total_pages: number
  current_page: number
  target_jump_index: number | null
}

/** M3：本地图片分页（GET /api/local/images/:folder/）。 */
export async function getLocalImages(
  folderName: string,
  page = 1,
): Promise<LocalImagesResponse> {
  const { data } = await apiClient.get<LocalImagesResponse>(
    `/local/images/${encodeURIComponent(folderName)}/`,
    { params: { page } },
  )
  return data
}

/** M4 本地视频文件项。 */
export interface LocalVideoFile {
  name: string
  /** 视频地址（nginx 直接服务 /media/videos/{folder}/{file}）。 */
  url: string
}

/** M4 本地视频列表响应。 */
export interface LocalVideosResponse {
  folder_name: string
  files: LocalVideoFile[]
  count: number
  first_video: LocalVideoFile | null
}

/** M4：本地视频列表（GET /api/local/videos/:folder/）。 */
export async function getLocalVideos(
  folderName: string,
): Promise<LocalVideosResponse> {
  const { data } = await apiClient.get<LocalVideosResponse>(
    `/local/videos/${encodeURIComponent(folderName)}/`,
  )
  return data
}
