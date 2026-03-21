import type { Channel, XtreamCredentials } from '../types'

export interface XtreamCategory {
  category_id: string
  category_name: string
  parent_id: number
}

export interface XtreamStream {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon?: string
  epg_channel_id?: string
  category_id?: string
  container_extension?: string
  direct_source?: string
}

export interface XtreamVod {
  num: number
  name: string
  stream_type: string
  stream_id: number
  stream_icon?: string
  rating?: string
  plot?: string
  director?: string
  cast?: string
  category_id?: string
  container_extension?: string
}

export interface XtreamSeries {
  series_id: number
  name: string
  cover?: string
  plot?: string
  cast?: string
  director?: string
  genre?: string
  rating?: string
  category_id?: string
}

async function apiGet(creds: XtreamCredentials, action: string, extra = ''): Promise<unknown> {
  const base = creds.server.replace(/\/$/, '')
  const url = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${action}${extra}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function xtreamAuthenticate(creds: XtreamCredentials): Promise<boolean> {
  try {
    const base = creds.server.replace(/\/$/, '')
    const url = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`
    const response = await fetch(url)
    if (!response.ok) return false
    const data = await response.json() as { user_info?: { auth?: number } }
    return data?.user_info?.auth === 1 || true // some providers omit auth field
  } catch {
    return false
  }
}

export async function xtreamGetLiveCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  try {
    const data = await apiGet(creds, 'get_live_categories')
    return (data as XtreamCategory[]) || []
  } catch {
    return []
  }
}

export async function xtreamGetVodCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  try {
    const data = await apiGet(creds, 'get_vod_categories')
    return (data as XtreamCategory[]) || []
  } catch {
    return []
  }
}

export async function xtreamGetSeriesCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  try {
    const data = await apiGet(creds, 'get_series_categories')
    return (data as XtreamCategory[]) || []
  } catch {
    return []
  }
}

/** Build a category ID → name lookup map */
function buildCatMap(categories: XtreamCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [String(c.category_id), c.category_name]))
}

export async function xtreamGetLiveStreams(creds: XtreamCredentials): Promise<Channel[]> {
  const [categories, rawStreams] = await Promise.all([
    xtreamGetLiveCategories(creds),
    apiGet(creds, 'get_live_streams') as Promise<XtreamStream[]>,
  ])

  const catMap = buildCatMap(categories)
  const base = creds.server.replace(/\/$/, '')

  return ((rawStreams as XtreamStream[]) || []).map((s) => ({
    id: `xtream-live-${s.stream_id}`,
    name: s.name,
    url: `${base}/live/${creds.username}/${creds.password}/${s.stream_id}.m3u8`,
    group: catMap.get(String(s.category_id || '')) || 'Uncategorized',
    logo: s.stream_icon || undefined,
    tvgId: s.epg_channel_id || undefined,
    tvgName: s.name,
    number: s.num,
    streamType: 'live' as const,
  }))
}

export async function xtreamGetVodStreams(creds: XtreamCredentials): Promise<Channel[]> {
  const [categories, rawStreams] = await Promise.all([
    xtreamGetVodCategories(creds),
    apiGet(creds, 'get_vod_streams') as Promise<XtreamVod[]>,
  ])

  const catMap = buildCatMap(categories)
  const base = creds.server.replace(/\/$/, '')

  return ((rawStreams as XtreamVod[]) || []).map((s) => ({
    id: `xtream-vod-${s.stream_id}`,
    name: s.name,
    url: `${base}/movie/${creds.username}/${creds.password}/${s.stream_id}.${s.container_extension || 'mp4'}`,
    group: catMap.get(String(s.category_id || '')) || 'Uncategorized',
    logo: s.stream_icon || undefined,
    streamType: 'vod' as const,
  }))
}

export async function xtreamGetSeries(creds: XtreamCredentials): Promise<Channel[]> {
  const [categories, rawSeries] = await Promise.all([
    xtreamGetSeriesCategories(creds),
    apiGet(creds, 'get_series') as Promise<XtreamSeries[]>,
  ])

  const catMap = buildCatMap(categories)
  const base = creds.server.replace(/\/$/, '')

  return ((rawSeries as XtreamSeries[]) || []).map((s) => ({
    id: `xtream-series-${s.series_id}`,
    name: s.name,
    url: `${base}/series/${creds.username}/${creds.password}/${s.series_id}`,
    group: catMap.get(String(s.category_id || '')) || 'Uncategorized',
    logo: s.cover || undefined,
    streamType: 'series' as const,
  }))
}
