import type { Channel, StalkerCredentials } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function portalApi(portal: string, params: string): string {
  return `${portal}/portal.php?${params}&JsHttpRequest=1-xml`
}

function authHeaders(mac: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Cookie: `mac=${mac}; stb_lang=en; timezone=UTC`,
    'X-User-Agent': 'Model: MAG250; Link: WiFi',
    Referer: '', // some portals check this
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function portalFetch(url: string, mac: string, token?: string): Promise<unknown> {
  const result = (await window.api.net.fetch(url, {
    headers: authHeaders(mac, token),
  })) as { data?: string; error?: string; status: number }

  if (result.error) throw new Error(result.error)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Portal returned HTTP ${result.status}`)
  }

  const text = atob(result.data!)
  // Some portals wrap the JSON in an HTML response — strip any leading HTML
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart === -1) throw new Error('Portal did not return a valid response — check your Portal URL and MAC address')
  try {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
  } catch {
    throw new Error('Portal returned an unrecognised response — the Portal URL may be incorrect or the MAC address may not be authorised')
  }
}

function extractStreamUrl(cmd: string): string {
  // "ffmpeg http://..." → "http://..."
  // "auto http://..." → "http://..."
  // "http://..." → "http://..."
  return cmd.replace(/^(ffmpeg|auto|vlc)\s+/i, '').trim()
}

function needsCreateLink(url: string): boolean {
  // Not a real HTTP URL → needs resolving
  if (!url.startsWith('http')) return true
  // localhost/127.0.0.1 = STB-relative address, not a real external URL
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return true
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function stalkerHandshake(creds: StalkerCredentials): Promise<string> {
  const url = portalApi(creds.portal, 'type=stb&action=handshake')
  const data = (await portalFetch(url, creds.mac)) as { js?: { token?: string } }
  if (!data?.js?.token) throw new Error('Handshake failed — portal did not return a token')
  return data.js.token
}

export async function stalkerAuthenticate(creds: StalkerCredentials): Promise<boolean> {
  const token = await stalkerHandshake(creds)
  // Validate token is usable by fetching profile
  const url = portalApi(creds.portal, 'type=stb&action=get_profile')
  await portalFetch(url, creds.mac, token)
  return true
}

// ── Create link (resolve portal-relative cmd values) ──────────────────────

async function createLink(
  portal: string,
  mac: string,
  token: string,
  cmd: string,
): Promise<string> {
  const url = portalApi(
    portal,
    `type=itv&action=create_link&cmd=${encodeURIComponent(cmd)}`,
  )
  const data = (await portalFetch(url, mac, token)) as { js?: { cmd?: string } }
  if (!data?.js?.cmd) throw new Error('create_link returned no URL')
  return extractStreamUrl(data.js.cmd)
}

// ── Live channels ──────────────────────────────────────────────────────────

export async function stalkerGetLive(creds: StalkerCredentials): Promise<Channel[]> {
  const token = await stalkerHandshake(creds)
  const { portal, mac } = creds

  // Fetch genre map (category id → name)
  const genreData = (await portalFetch(
    portalApi(portal, 'type=itv&action=get_genres'),
    mac,
    token,
  )) as { js?: Array<{ id: string; title: string }> }

  const genreMap = new Map<string, string>()
  for (const g of genreData.js || []) {
    genreMap.set(String(g.id), g.title)
  }

  // Fetch all channels
  const chanData = (await portalFetch(
    portalApi(portal, 'type=itv&action=get_all_channels'),
    mac,
    token,
  )) as {
    js?: {
      data?: Array<{
        id: string
        name: string
        logo: string
        cmd: string
        tv_genre_id: string
        number?: number
      }>
    }
  }

  const channels: Channel[] = []
  for (const ch of chanData.js?.data || []) {
    if (!ch.cmd) continue
    let streamUrl = extractStreamUrl(ch.cmd)
    if (needsCreateLink(streamUrl)) {
      try {
        streamUrl = await createLink(portal, mac, token, ch.cmd)
      } catch {
        continue // Skip unresolvable channels
      }
    }
    channels.push({
      id: `stalker-live-${ch.id}`,
      name: ch.name,
      url: streamUrl,
      group: genreMap.get(String(ch.tv_genre_id)) || 'General',
      logo: ch.logo || '',
      number: ch.number,
      streamType: 'live',
    })
  }
  return channels
}

// ── VOD (paginated, cap at 2000 items) ─────────────────────────────────────

export async function stalkerGetVod(creds: StalkerCredentials): Promise<Channel[]> {
  const token = await stalkerHandshake(creds)
  const { portal, mac } = creds
  const channels: Channel[] = []
  let page = 1
  const MAX_ITEMS = 2000

  while (channels.length < MAX_ITEMS) {
    const url = portalApi(
      portal,
      `type=vod&action=get_ordered_list&sortby=added&p=${page}&categories=*`,
    )
    const data = (await portalFetch(url, mac, token)) as {
      js?: {
        data?: Array<{ id: string; name: string; logo: string; cmd: string }>
        total_items?: number
        max_page_items?: number
      }
    }

    const items = data.js?.data || []
    if (items.length === 0) break

    for (const item of items) {
      if (!item.cmd) continue
      let streamUrl = extractStreamUrl(item.cmd)
      if (needsCreateLink(streamUrl)) {
        try {
          streamUrl = await createLink(portal, mac, token, item.cmd)
        } catch {
          continue
        }
      }
      channels.push({
        id: `stalker-vod-${item.id}`,
        name: item.name,
        url: streamUrl,
        group: 'VOD',
        logo: item.logo || '',
        streamType: 'vod',
      })
    }

    const total = data.js?.total_items ?? 0
    const perPage = data.js?.max_page_items ?? 14
    if (page * perPage >= total || items.length < perPage) break
    page++
  }

  return channels
}
