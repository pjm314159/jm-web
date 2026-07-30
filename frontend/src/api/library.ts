import { apiClient } from './client'

/** 本子卡片（对应后端 AlbumSerializer）。 */
export interface Album {
  id: number
  jm_id: string
  name: string
  author: string | null
  tags: string[]
  cover_url: string | null
  total_episodes: number
  downloaded_episodes: number
  created_at: string
}

/** 章节（对应后端 PhotoSerializer）。 */
export interface Photo {
  id: number
  jm_id: string | null
  name: string
  sort_index: number
  is_downloaded: boolean
  save_path: string | null
}

/** 本子详情（对应后端 AlbumDetailSerializer）。 */
export interface AlbumDetail extends Album {
  description: string | null
  actors: string[] | null
  photos: Photo[]
}

/** DRF 分页响应结构。 */
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** L1：藏书阁本子列表（仅含已下载章节的本子，按创建时间倒序）。 */
export async function getAlbums(page = 1): Promise<Paginated<Album>> {
  const { data } = await apiClient.get<Paginated<Album>>('/library/albums/', {
    params: { page },
  })
  return data
}

/** L1+：本地库高级搜索（名称/作者模糊 + 多 tag 交集筛选）。 */
export async function searchLibraryAlbums(params: {
  q?: string
  tags?: string[]
  page?: number
}): Promise<Paginated<Album>> {
  const { data } = await apiClient.get<Paginated<Album>>('/library/albums/', {
    params: {
      q: params.q || undefined,
      tags: params.tags?.length ? params.tags.join(',') : undefined,
      page: params.page || 1,
    },
  })
  return data
}

/** L6 tag 响应结构。 */
export interface TagItem {
  tag: string
  count: number
}

/** L6：获取本地库 tag（默认 top10 频次，q 搜索全部）。 */
export async function getLibraryTags(q?: string): Promise<TagItem[]> {
  const { data } = await apiClient.get<{ tags: TagItem[] }>('/library/albums/tags/', {
    params: q ? { q } : undefined,
  })
  return data.tags
}

/** L2：本子详情（含章节列表）。 */
export async function getAlbumDetail(id: number): Promise<AlbumDetail> {
  const { data } = await apiClient.get<AlbumDetail>(`/library/albums/${id}/`)
  return data
}

/** L3：删除本子（文件 + 记录）。 */
export async function deleteAlbum(id: number): Promise<void> {
  await apiClient.delete(`/library/albums/${id}/`)
}

/** L4 检查更新响应。 */
export interface CheckUpdateResult {
  has_updates: boolean
  new_episodes: { photo_id: string; index: number; name: string }[]
  new_count: number
  local_count: number
  remote_count: number
}

/** L4：对比远端章节，返回新章节差集。 */
export async function checkAlbumUpdates(id: number): Promise<CheckUpdateResult> {
  const { data } = await apiClient.post<CheckUpdateResult>(`/library/albums/${id}/check-updates/`)
  return data
}

/** L5 本地阅读器响应（300 图/页，images 为可直接渲染的 /media/ URL）。 */
export interface PhotoReaderResponse {
  photo_id: number
  name: string
  album_id: number
  images: string[]
  total_images: number
  current_start_index: number
  page: number
  total_pages: number
  images_per_page: number
  target: string | null
  prev_photo_id: number | null
  next_photo_id: number | null
}

/** L5：本地阅读器数据（GET /api/library/photos/:id/）。 */
export async function getPhotoReader(id: number, page = 1): Promise<PhotoReaderResponse> {
  const { data } = await apiClient.get<PhotoReaderResponse>(`/library/photos/${id}/`, {
    params: { page },
  })
  return data
}
