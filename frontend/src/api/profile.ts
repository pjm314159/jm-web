import { apiClient } from './client'

/** 已关联的 JM 账号信息。 */
export interface JmAccountInfo {
  username: string
  uid: string | null
  email: string | null
  level_name: string | null
  album_favorites: number | null
  coin: string | null
  linked_at: string | null
}

export interface ProfileResponse {
  linked: boolean
  account: JmAccountInfo | null
}

export interface FavoriteAlbum {
  album_id: string
  title: string
  cover_url: string | null
  is_downloaded: boolean
}

export interface FavoritesResponse {
  current: number
  total: number
  page_count: number
  has_prev: boolean
  has_next: boolean
  prev_num: number
  next_num: number
  albums: FavoriteAlbum[]
}

/** 获取个人资料（含已关联的 JM 账号信息）。 */
export async function getProfile(): Promise<ProfileResponse> {
  const { data } = await apiClient.get<ProfileResponse>('/profile/')
  return data
}

/** 关联 JM 账号。 */
export async function linkJmAccount(
  username: string,
  password: string,
): Promise<{ account: JmAccountInfo }> {
  const { data } = await apiClient.post<{ account: JmAccountInfo }>('/profile/link/', {
    username,
    password,
  })
  return data
}

/** 解除 JM 账号关联。 */
export async function unlinkJmAccount(): Promise<void> {
  await apiClient.post('/profile/unlink/')
}

/** 获取已关联账号的收藏夹（按页）。 */
export async function getJmFavorites(page = 1): Promise<FavoritesResponse> {
  const { data } = await apiClient.get<FavoritesResponse>('/profile/favorites/', {
    params: { page },
  })
  return data
}
