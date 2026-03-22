import http from 'http'
import https from 'https'
import os from 'os'
import { Bonjour } from 'bonjour-service'
import type { WebContents } from 'electron'
import type { CastDevice } from '../shared/castTypes'

// castv2-client is a legacy CJS module with no TypeScript types
// eslint-disable-next-line @typescript-eslint/no-require-imports
const castv2 = require('castv2-client')
const CastClient = castv2.Client
const DefaultMediaReceiver = castv2.DefaultMediaReceiver

// ── State ──────────────────────────────────────────────────────────────────

const discoveredDevices = new Map<string, CastDevice>()
const dlnaControlUrls = new Map<string, string>() // deviceId → full AVTransport control URL

let rendererWebContents: WebContents | null = null
let bonjourInstance: Bonjour | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ssdpClient: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeCastClient: any = null
let proxyServer: http.Server | null = null

// ── Helpers ────────────────────────────────────────────────────────────────

function notifyRenderer(): void {
  if (rendererWebContents && !rendererWebContents.isDestroyed()) {
    rendererWebContents.send('cast:devicesUpdated', [...discoveredDevices.values()])
  }
}

function getLanIp(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod
      .get(url, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function extractAvTransportUrl(xml: string, baseUrl: string): string | null {
  // Find <controlURL> inside the AVTransport service block
  const block = xml.match(
    /urn:schemas-upnp-org:service:AVTransport:1[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i,
  )
  if (!block) return null
  const path = block[1].trim()
  if (path.startsWith('http')) return path
  const u = new URL(baseUrl)
  return `${u.protocol}//${u.host}${path.startsWith('/') ? path : '/' + path}`
}

// ── Chromecast discovery (mDNS via bonjour-service) ────────────────────────

function startBonjour(): void {
  bonjourInstance = new Bonjour()
  bonjourInstance.find({ type: 'googlecast' }, (service) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txt = (service as any).txt as Record<string, string> | undefined
    const host = (service.addresses?.[0]) || service.host
    const device: CastDevice = {
      id: `cc-${service.name}`,
      name: txt?.fn || service.name,
      type: 'chromecast',
      host,
      port: service.port,
    }
    discoveredDevices.set(device.id, device)
    notifyRenderer()
  })
}

// ── DLNA discovery (SSDP) ──────────────────────────────────────────────────

function startSsdp(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('node-ssdp')
    ssdpClient = new Client()

    ssdpClient.on('response', async (headers: Record<string, string>) => {
      const location = headers['LOCATION']
      if (!location) return
      try {
        const xml = await fetchText(location)
        const name = extractTag(xml, 'friendlyName') || 'DLNA Device'
        const controlUrl = extractAvTransportUrl(xml, location)
        if (!controlUrl) return

        const u = new URL(location)
        const deviceId = `dlna-${u.host}`
        if (!discoveredDevices.has(deviceId)) {
          const device: CastDevice = {
            id: deviceId,
            name,
            type: 'dlna',
            host: u.hostname,
            port: parseInt(u.port) || 80,
          }
          discoveredDevices.set(deviceId, device)
          dlnaControlUrls.set(deviceId, controlUrl)
          notifyRenderer()
        }
      } catch {
        // Unreachable or non-media device — skip
      }
    })

    ssdpClient.search('urn:schemas-upnp-org:device:MediaRenderer:1')
  } catch {
    console.warn('[cast] node-ssdp unavailable, DLNA discovery disabled')
  }
}

// ── Local TS → HLS proxy ───────────────────────────────────────────────────

async function startProxy(tsUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    proxyServer = http.createServer((req, res) => {
      if (req.url === '/proxy.m3u8') {
        const addr = proxyServer!.address() as { port: number }
        const lanIp = getLanIp()
        const m3u8 = [
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          '#EXT-X-TARGETDURATION:0',
          '#EXT-X-MEDIA-SEQUENCE:0',
          '#EXTINF:0,',
          `http://${lanIp}:${addr.port}/segment.ts`,
        ].join('\n')
        res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' })
        res.end(m3u8)
      } else if (req.url === '/segment.ts') {
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Transfer-Encoding': 'chunked' })
        const mod = tsUrl.startsWith('https') ? https : http
        mod
          .get(tsUrl, (upstream) => {
            upstream.pipe(res)
            upstream.on('error', () => res.end())
          })
          .on('error', () => res.end())
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    proxyServer.listen(0, '0.0.0.0', () => {
      const addr = proxyServer!.address() as { port: number }
      resolve(`http://${getLanIp()}:${addr.port}/proxy.m3u8`)
    })
    proxyServer.on('error', reject)
  })
}

function stopProxy(): void {
  if (proxyServer) {
    proxyServer.close()
    proxyServer = null
  }
}

// ── Chromecast session ─────────────────────────────────────────────────────

async function castToChromecast(
  device: CastDevice,
  streamUrl: string,
  channelName: string,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let effectiveUrl = streamUrl

    // Match the same URL-type logic used in the renderer player
    const isHls = streamUrl.includes('.m3u8') ||
      (streamUrl.includes('/live/') && !streamUrl.endsWith('.ts'))
    let contentType = isHls ? 'application/x-mpegurl' : 'video/mp4'

    if (streamUrl.endsWith('.ts')) {
      try {
        effectiveUrl = await startProxy(streamUrl)
        contentType = 'application/x-mpegurl'
      } catch (err) {
        reject(new Error(`Proxy start failed: ${err}`))
        return
      }
    }

    const client = new CastClient()
    activeCastClient = client

    client.on('error', (err: Error) => {
      stopProxy()
      reject(err)
    })

    client.connect(device.host, () => {
      client.launch(DefaultMediaReceiver, (launchErr: Error | null, player: unknown) => {
        if (launchErr) {
          reject(launchErr)
          return
        }
        const media = {
          contentId: effectiveUrl,
          contentType,
          streamType: 'LIVE',
          metadata: { type: 0, metadataType: 0, title: channelName, images: [] },
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(player as any).load(media, { autoplay: true }, (loadErr: Error | null) => {
          if (loadErr) reject(loadErr)
          else resolve()
        })
      })
    })
  })
}

// ── DLNA session ───────────────────────────────────────────────────────────

async function soapRequest(controlUrl: string, action: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(controlUrl)
    const payload = Buffer.from(body, 'utf-8')
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || '80',
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPACTION: `"${action}"`,
          'Content-Length': payload.length,
        },
      },
      (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve()
        else reject(new Error(`SOAP error: HTTP ${res.statusCode}`))
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function castToDlna(
  device: CastDevice,
  streamUrl: string,
  channelName: string,
): Promise<void> {
  const controlUrl = dlnaControlUrls.get(device.id)
  if (!controlUrl) throw new Error('DLNA AVTransport URL not found for device')

  const escapedUrl = escapeXml(streamUrl)
  const escapedName = escapeXml(channelName)
  const mimeType = streamUrl.endsWith('.ts') ? 'video/mpeg' : 'video/mpeg'
  const didl = `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="-1" restricted="1"&gt;&lt;dc:title&gt;${escapedName}&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:${mimeType}:*"&gt;${escapedUrl}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`

  await soapRequest(
    controlUrl,
    'urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI',
    `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>${escapedUrl}</CurrentURI>
      <CurrentURIMetaData>${didl}</CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`,
  )

  await soapRequest(
    controlUrl,
    'urn:schemas-upnp-org:service:AVTransport:1#Play',
    `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`,
  )
}

// ── Public API ─────────────────────────────────────────────────────────────

export function initCastService(webContents: WebContents): void {
  rendererWebContents = webContents
  startBonjour()
  startSsdp()
}

export function getDiscoveredDevices(): CastDevice[] {
  return [...discoveredDevices.values()]
}

export function restartDiscovery(webContents: WebContents): void {
  rendererWebContents = webContents
  try {
    ssdpClient?.search('urn:schemas-upnp-org:device:MediaRenderer:1')
  } catch {
    // ignore
  }
}

export async function startCast(
  deviceId: string,
  streamUrl: string,
  channelName: string = 'IPTV Channel',
): Promise<{ success: boolean; error?: string }> {
  const device = discoveredDevices.get(deviceId)
  if (!device) return { success: false, error: 'Device not found' }

  try {
    if (device.type === 'chromecast') {
      await castToChromecast(device, streamUrl, channelName)
    } else {
      await castToDlna(device, streamUrl, channelName)
    }
    return { success: true }
  } catch (err) {
    stopProxy()
    return { success: false, error: String(err) }
  }
}

export async function stopCast(): Promise<void> {
  if (activeCastClient) {
    try {
      activeCastClient.close()
    } catch {
      // ignore
    }
    activeCastClient = null
  }
  stopProxy()
}

export function destroyCastService(): void {
  stopCast()
  try {
    bonjourInstance?.destroy()
  } catch {
    // ignore
  }
  try {
    ssdpClient?.stop()
  } catch {
    // ignore
  }
  rendererWebContents = null
}
