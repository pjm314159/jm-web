/**
 * 搜索/排行榜共用的筛选选项常量与工具函数（无 React 依赖，避免 fast-refresh 警告）。
 */

import {
  type SearchCategory,
  type SearchOrderBy,
  type SearchSubCategory,
  type SearchTime,
} from '../api/search'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

/** 校验 URL 参数是否属于合法枚举值。 */
export function isIn<T extends string>(value: string | null, values: readonly T[]): value is T {
  return !!value && (values as readonly string[]).includes(value)
}

/** 排序方式选项（对应 jmcomic JmMagicConstants.ORDER_BY_*）。 */
export const ORDER_BY_OPTIONS: DropdownOption<SearchOrderBy>[] = [
  { value: 'mr', label: '最新' },
  { value: 'mv', label: '观看数' },
  { value: 'mp', label: '图片数' },
  { value: 'tf', label: '点赞数' },
  { value: 'tr', label: '评分' },
  { value: 'md', label: '评论数' },
  { value: 'mv_m', label: '月排行' },
  { value: 'mv_w', label: '周排行' },
  { value: 'mv_t', label: '日排行' },
]

/** 时间范围选项（对应 jmcomic JmMagicConstants.TIME_*）。 */
export const TIME_OPTIONS: DropdownOption<SearchTime>[] = [
  { value: 'a', label: '全部时间' },
  { value: 't', label: '今日' },
  { value: 'w', label: '本周' },
  { value: 'm', label: '本月' },
]

/** 分类选项（对应 jmcomic JmMagicConstants.CATEGORY_*）。 */
export const CATEGORY_OPTIONS: DropdownOption<SearchCategory>[] = [
  { value: '0', label: '全部分类' },
  { value: 'doujin', label: '同人' },
  { value: 'single', label: '单本' },
  { value: 'short', label: '短篇' },
  { value: 'another', label: '其他' },
  { value: 'hanman', label: '韩漫' },
  { value: 'meiman', label: '美漫' },
  { value: 'doujin_cosplay', label: 'Cosplay' },
  { value: '3D', label: '3D' },
  { value: 'english_site', label: '英文站' },
]

/** 各分类下的副分类选项（空数组表示该分类无副分类）。 */
export const SUB_CATEGORY_OPTIONS_BY_CATEGORY: Record<
  SearchCategory,
  DropdownOption<SearchSubCategory | ''>[]
> = {
  '0': [],
  doujin: [
    { value: '', label: '全部' },
    { value: 'CG', label: 'CG' },
    { value: 'chinese', label: '汉化' },
    { value: 'japanese', label: '日语' },
  ],
  single: [
    { value: '', label: '全部' },
    { value: 'chinese', label: '汉化' },
    { value: 'japanese', label: '日语' },
    { value: 'youth', label: '青年' },
  ],
  short: [
    { value: '', label: '全部' },
    { value: 'chinese', label: '汉化' },
    { value: 'japanese', label: '日语' },
  ],
  another: [
    { value: '', label: '全部' },
    { value: 'other', label: '其他漫画' },
    { value: '3d', label: '3D' },
    { value: 'cosplay', label: 'Cosplay' },
  ],
  hanman: [],
  meiman: [],
  doujin_cosplay: [],
  '3D': [],
  english_site: [],
}

export const ORDER_BY_VALUES: SearchOrderBy[] = ['mr', 'mv', 'mp', 'tf', 'tr', 'md', 'mv_m', 'mv_w', 'mv_t']
export const TIME_VALUES: SearchTime[] = ['t', 'w', 'm', 'a']
export const CATEGORY_VALUES: SearchCategory[] = [
  '0',
  'doujin',
  'single',
  'short',
  'another',
  'hanman',
  'meiman',
  'doujin_cosplay',
  '3D',
  'english_site',
]
export const SUB_CATEGORY_VALUES: SearchSubCategory[] = [
  'chinese',
  'japanese',
  'other',
  '3d',
  'cosplay',
  'CG',
  'youth',
]
