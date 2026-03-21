import type { EpgChannel, EpgProgram } from '../types'

function parseXmltvDate(dateStr: string): Date {
  // Format: YYYYMMDDHHmmss +TZ
  const clean = dateStr.replace(/\s.*/, '') // strip timezone
  const y = clean.slice(0, 4)
  const mo = clean.slice(4, 6)
  const d = clean.slice(6, 8)
  const h = clean.slice(8, 10)
  const m = clean.slice(10, 12)
  const s = clean.slice(12, 14) || '00'
  const tzMatch = dateStr.match(/([+-]\d{4})/)
  const tz = tzMatch ? tzMatch[1] : '+0000'
  return new Date(`${y}-${mo}-${d}T${h}:${m}:${s}${tz}`)
}

function getTagContent(el: Element, tag: string): string {
  return el.querySelector(tag)?.textContent?.trim() || ''
}

function getAttribute(el: Element, attr: string): string {
  return el.getAttribute(attr) || ''
}

export function parseXMLTV(xmlContent: string): Map<string, EpgChannel> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlContent, 'text/xml')

  const channelMap = new Map<string, EpgChannel>()

  // Parse <channel> elements
  const channelEls = doc.querySelectorAll('channel')
  channelEls.forEach((el) => {
    const id = getAttribute(el, 'id')
    if (!id) return
    const displayName = getTagContent(el, 'display-name') || id
    const iconEl = el.querySelector('icon')
    const icon = iconEl?.getAttribute('src') || undefined

    channelMap.set(id, { id, displayName, icon, programs: [] })
  })

  // Parse <programme> elements
  const programEls = doc.querySelectorAll('programme')
  programEls.forEach((el) => {
    const channelId = getAttribute(el, 'channel')
    const startStr = getAttribute(el, 'start')
    const endStr = getAttribute(el, 'stop')

    if (!channelId || !startStr || !endStr) return

    const channel = channelMap.get(channelId)
    if (!channel) {
      // Create a placeholder channel
      channelMap.set(channelId, { id: channelId, displayName: channelId, programs: [] })
    }

    const iconEl = el.querySelector('icon')
    const program: EpgProgram = {
      id: `${channelId}-${startStr}`,
      channelId,
      title: getTagContent(el, 'title') || 'Unknown',
      description: getTagContent(el, 'desc') || undefined,
      start: parseXmltvDate(startStr),
      end: parseXmltvDate(endStr),
      category: getTagContent(el, 'category') || undefined,
      icon: iconEl?.getAttribute('src') || undefined,
    }

    channelMap.get(channelId)!.programs.push(program)
  })

  return channelMap
}

export function getCurrentProgram(programs: EpgProgram[]): EpgProgram | null {
  const now = new Date()
  return programs.find((p) => p.start <= now && p.end >= now) || null
}

export function getNextProgram(programs: EpgProgram[]): EpgProgram | null {
  const now = new Date()
  const sorted = [...programs].sort((a, b) => a.start.getTime() - b.start.getTime())
  return sorted.find((p) => p.start > now) || null
}

export function getProgramsInRange(
  programs: EpgProgram[],
  start: Date,
  end: Date
): EpgProgram[] {
  return programs.filter((p) => p.end >= start && p.start <= end)
}
