/**
 * vodProxy.ts — local HTTP transcoding proxy for VOD audio
 *
 * Spawns ffmpeg-static to transcode audio to AAC on the fly while copying
 * video unchanged. This lets Electron/Chromium play VOD streams with
 * AC3/EAC3/DTS audio tracks that Chromium's stripped ffmpeg cannot decode.
 *
 * The proxy listens on a random localhost port. The renderer requests:
 *   http://127.0.0.1:<port>/transcode?url=<encoded-vod-url>
 * and receives a fragmented MP4 stream it can play natively.
 */

import * as http from 'http'
import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import ffmpegStaticPath from 'ffmpeg-static'

/** Resolve the ffmpeg binary path — adjust for asar packaging */
function getFFmpegBin(): string {
  const p = ffmpegStaticPath!
  if (app.isPackaged) {
    // ffmpeg-static binary is unpacked outside the asar archive via asarUnpack
    return p.replace('app.asar', 'app.asar.unpacked')
  }
  return p
}

let server: http.Server | null = null
let proxyPort: number | null = null
const activeProcesses = new Set<ChildProcess>()

export function getVodProxyPort(): number | null {
  return proxyPort
}

export function startVodProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let parsed: URL
      try {
        parsed = new URL(req.url ?? '', 'http://127.0.0.1')
      } catch {
        res.writeHead(400)
        res.end('Bad request')
        return
      }

      if (parsed.pathname !== '/transcode') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const targetUrl = parsed.searchParams.get('url')
      if (!targetUrl) {
        res.writeHead(400)
        res.end('Missing url parameter')
        return
      }

      const ffmpeg = spawn(getFFmpegBin(), [
        '-loglevel', 'error',
        '-i', targetUrl,
        '-c:v', 'copy',           // pass video through unchanged
        '-c:a', 'aac',            // transcode audio → AAC (always supported by Chromium)
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov', // fragmented MP4 for progressive streaming
        '-f', 'mp4',
        'pipe:1',
      ])

      activeProcesses.add(ffmpeg)

      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      })

      ffmpeg.stdout.pipe(res)

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.error('[vodProxy]', data.toString().trim())
      })

      ffmpeg.on('close', () => {
        activeProcesses.delete(ffmpeg)
        if (!res.writableEnded) res.end()
      })

      ffmpeg.on('error', (err: Error) => {
        activeProcesses.delete(ffmpeg)
        console.error('[vodProxy] spawn error:', err.message)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end(err.message)
        }
      })

      // Kill ffmpeg when the client disconnects (e.g. user switches channel)
      req.on('close', () => {
        ffmpeg.kill('SIGKILL')
        activeProcesses.delete(ffmpeg)
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as { port: number }
      proxyPort = addr.port
      console.log(`[vodProxy] Listening on port ${proxyPort}`)
      resolve(proxyPort)
    })

    server.on('error', reject)
  })
}

export function stopVodProxy(): void {
  for (const proc of activeProcesses) {
    proc.kill('SIGKILL')
  }
  activeProcesses.clear()
  server?.close()
  server = null
  proxyPort = null
}
