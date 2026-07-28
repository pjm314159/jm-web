import { apiClient } from './client'

/** 搜索结果本子项（对应后端 search service 组装的 dict）。 */
export interface SearchAlbum {
  jm_id: string
  name: string
  author: string
  tags: string[]
  description: string
  update_time: string
  cover_url: string | null
  is_downloaded: boolean
  category: string
}

/** 分页信息。 */
export interface SearchPagination {
  current: number
  total: number
  page_count: number
  has_prev: boolean
  has_next: boolean
  prev_num: number
  next_num: number
}

/** S1 搜索响应。 */
export interface SearchResponse {
  query: string
  search_type: string
  results: SearchAlbum[]
  pagination: SearchPagination
  error: string | null
}

export type SearchType = 'keyword' | 'tag'

/** S1：关键词/标签搜索（GET /api/search/）。 */
export async function searchJm(
  query: string,
  type: SearchType = 'keyword',
  page = 1,
): Promise<SearchResponse> {
  const { data } = await apiClient.get<SearchResponse>('/search/', {
    params: { q: query, type, page },
  })
  return data
}

/* ─── S2：在线本子详情 ─────────────────────────────── */

export interface SearchEpisode {
  photo_id: string
  index: number
  name: string
}

export interface SearchAlbumDetail {
  jm_id: string
  name: string
  author: string
  description: string
  tags: string[]
  cover_url: string | null
  likes: number
  views: number
  comments_count: number
  episode_list: SearchEpisode[]
}

export interface SearchDetailResponse {
  album: SearchAlbumDetail
  is_downloaded: boolean
  local_album_id: number | null
  has_updates: boolean
  new_episode_count: number
}

/** S2：在线本子详情（GET /api/search/albums/:jmId/）。 */
export async function getSearchAlbumDetail(jmId: string): Promise<SearchDetailResponse> {
  const { data } = await apiClient.get<SearchDetailResponse>(`/search/albums/${jmId}/`)
  return data
}

/** S3 在线章节列表响应。 */
export interface SearchEpisodesResponse {
  jm_id: string
  name: string
  episode_list: SearchEpisode[]
}

/** S3：在线章节列表（GET /api/search/albums/:jmId/episodes/）。 */
export async function getSearchAlbumEpisodes(jmId: string): Promise<SearchEpisodesResponse> {
  const { data } = await apiClient.get<SearchEpisodesResponse>(`/search/albums/${jmId}/episodes/`)
  return data
}

/** S4 在线阅读器图片项：url 为远端图片地址，num 为反混淆切片数（前端 Canvas 重绘用）。 */
export interface SearchReaderImage {
  url: string
  num: number
}

/** S4 在线阅读器响应（300 图/页）。 */
export interface SearchReaderResponse {
  photo_id: string
  album_id: string | number
  scramble_id: string | number
  images: SearchReaderImage[]
  total_images: number
  current_start_index: number
  page: number
  total_pages: number
  images_per_page: number
  target: string | null
}

/** S4：在线阅读器图片列表（GET /api/search/photos/:photoId/images/）。 */
export async function getSearchPhotoImages(
  photoId: string,
  page = 1,
): Promise<SearchReaderResponse> {
  const { data } = await apiClient.get<SearchReaderResponse>(`/search/photos/${photoId}/images/`, {
    params: { page },
  })
  return data
}
