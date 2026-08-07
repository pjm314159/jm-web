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
  filters?: SearchFilters
  error: string | null
}

export type SearchType = 'keyword' | 'tag'

/** Sorting orders, mirroring jmcomic JmMagicConstants.ORDER_BY_*. */
export type SearchOrderBy =
  | 'mr'
  | 'mv'
  | 'mp'
  | 'tf'
  | 'tr'
  | 'md'
  | 'mv_m'
  | 'mv_w'
  | 'mv_t'

/** Time ranges, mirroring jmcomic JmMagicConstants.TIME_*. */
export type SearchTime = 't' | 'w' | 'm' | 'a'

/** Categories, mirroring jmcomic JmMagicConstants.CATEGORY_*. */
export type SearchCategory =
  | '0'
  | 'doujin'
  | 'single'
  | 'short'
  | 'another'
  | 'hanman'
  | 'meiman'
  | 'doujin_cosplay'
  | '3D'
  | 'english_site'

/** Sub categories, mirroring jmcomic JmMagicConstants.SUB_*. */
export type SearchSubCategory = 'chinese' | 'japanese' | 'other' | '3d' | 'cosplay' | 'CG' | 'youth'

/** Optional search filters. */
export interface SearchFilters {
  order_by?: SearchOrderBy
  time?: SearchTime
  category?: SearchCategory
  sub_category?: SearchSubCategory
}

/** S1：关键词/标签搜索（GET /api/search/）。 */
export async function searchJm(
  query: string,
  type: SearchType = 'keyword',
  page = 1,
  filters: SearchFilters = {},
): Promise<SearchResponse> {
  const { data } = await apiClient.get<SearchResponse>('/search/', {
    params: {
      q: query,
      type,
      page,
      order_by: filters.order_by,
      time: filters.time,
      category: filters.category,
      sub_category: filters.sub_category,
    },
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

/* ─── S5：在线评论 ─────────────────────────── */

/** 单条评论（含嵌套回复）。 */
export interface AlbumComment {
  comment_id: string | null
  user_id: string | null
  username: string
  nickname: string
  content: string
  created_at: string | number | null
  likes: number | null
  is_spoiler: boolean
  replies: AlbumComment[]
}

/** S5 评论分页响应。 */
export interface AlbumCommentsResponse {
  jm_id: string
  page: number
  total: number | null
  page_count: number | null
  has_next: boolean
  comments: AlbumComment[]
}

/** S5：在线评论分页（GET /api/search/albums/:jmId/comments/）。 */
export async function getSearchAlbumComments(
  jmId: string,
  page = 1,
): Promise<AlbumCommentsResponse> {
  const { data } = await apiClient.get<AlbumCommentsResponse>(`/search/albums/${jmId}/comments/`, {
    params: { page },
  })
  return data
}
