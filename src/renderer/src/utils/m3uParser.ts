import type { Channel } from '../types'

function parseAttribute(line: string, attr: string): string | undefined {
  // Match both quoted and unquoted attribute values
  const quoted = line.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  if (quoted) return quoted[1] || undefined
  const unquoted = line.match(new RegExp(`${attr}=([^\\s,]+)`, 'i'))
  return unquoted?.[1] || undefined
}

/** Detect stream type from URL patterns */
function detectStreamType(url: string): 'live' | 'vod' | 'series' {
  if (/\/movie\//i.test(url) || /\.(mp4|mkv|avi|mov|wmv|flv)([?#]|$)/i.test(url)) return 'vod'
  if (/\/series\//i.test(url)) return 'series'
  return 'live'
}

export function parseM3U(content: string): Channel[] {
  // Normalize line endings (\r\n → \n, lone \r → \n)
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean)
  const channels: Channel[] = []

  if (!lines[0]?.startsWith('#EXTM3U')) {
    console.warn('M3U: missing #EXTM3U header — attempting to parse anyway')
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('#EXTINF:')) {
      // Channel name is everything after the LAST comma on the EXTINF line
      const lastComma = line.lastIndexOf(',')
      const displayName = lastComma >= 0 ? line.slice(lastComma + 1).trim() : ''

      const tvgId = parseAttribute(line, 'tvg-id')
      const tvgName = parseAttribute(line, 'tvg-name')
      const logo = parseAttribute(line, 'tvg-logo')
      const group = parseAttribute(line, 'group-title') || 'Uncategorized'

      // Final channel name: display name from EXTINF comma, then tvg-name, then fallback
      const name = displayName || tvgName || 'Unknown Channel'

      // Advance to find the stream URL (skip any additional # comment lines)
      let j = i + 1
      while (j < lines.length && lines[j].startsWith('#')) j++

      if (j < lines.length) {
        const url = lines[j]
        channels.push({
          id: `m3u-${tvgId || name}-${channels.length}`,
          name,
          url,
          group,
          logo: logo || undefined,
          tvgId: tvgId || undefined,
          tvgName: tvgName || undefined,
          number: channels.length + 1,
          streamType: detectStreamType(url),
        })
        i = j // advance past the URL line
      }
    }

    i++
  }

  return channels
}

export function exportM3U(channels: Channel[]): string {
  const lines = ['#EXTM3U']

  for (const ch of channels) {
    const attrs: string[] = []
    if (ch.tvgId) attrs.push(`tvg-id="${ch.tvgId}"`)
    if (ch.tvgName) attrs.push(`tvg-name="${ch.tvgName}"`)
    if (ch.logo) attrs.push(`tvg-logo="${ch.logo}"`)
    attrs.push(`group-title="${ch.group}"`)

    lines.push(`#EXTINF:-1 ${attrs.join(' ')},${ch.name}`)
    lines.push(ch.url)
  }

  return lines.join('\n')
}

export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>()
  for (const ch of channels) {
    if (!map.has(ch.group)) map.set(ch.group, [])
    map.get(ch.group)!.push(ch)
  }
  return map
}
