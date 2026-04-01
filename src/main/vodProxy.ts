/**
 * vodProxy.ts — local HTTP proxy for VOD audio transcoding
 *
 * Uses HLS segmentation instead of fragmented MP4 streaming, which gives
 * hls.js random-access seeking via its MSE implementation. ffmpeg writes
 * .m3u8 + .ts segments to a per-session temp directory; the proxy serves
 * those files and cleans up when the session ends.
 *
 * Endpoints:
 *   POST /hls?url=<encoded>
 *     Starts an ffmpeg HLS session. Polls until playlist.m3u8 is written,
 *     then returns JSON { sessionId, playlistUrl }.
 *
 *   GET /hls-file/:sessionId/<path>
 *     Serves .m3u8 and .ts files from the session temp dir.
 *
 *   DELETE /hls/:sessionId
 *     Stops ffmpeg and deletes the session temp dir.
 *
 *   GET /probe?url=<encoded>
 *     Returns JSON { duration: number | null } from ffmpeg stderr.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import ffmpegStaticPath from 'ffmpeg-static'

function getFFmpegBin(): string {
  const p = ffmpegStaticPath!
  if (app.isPackaged) {
    return p.replace('app.asar', 'app.asar.unpacked')
  }
  return p
}

/** Parse "Duration: HH:MM:SS.xx" from ffmpeg stderr → total seconds */
function parseDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) return null
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
}

/** Parse "Video: h264" (or hevc, mpeg2video, etc.) from ffmpeg stderr */
function parseVideoCodec(stderr: string): string | null {
  const m = stderr.match(/Stream #[^:]+:[^:]+: Video: (\w+)/)
  return m ? m[1] : null
}

const ALLOWED_SCHEMES = ['http:', 'https:', 'rtmp:', 'rtmps:', 'rtsp:']

function validateStreamUrl(raw: string): string {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Invalid URL') }
  if (!ALLOWED_SCHEMES.includes(u.protocol)) throw new Error(`Disallowed URL scheme: ${u.protocol}`)
  return raw
}

interface HlsSession {
  ffmpeg: ChildProcess
  tempDir: string
}

let server: http.Server | null = null
let proxyPort: number | null = null
const hlsSessions = new Map<string, HlsSession>()
const MAX_HLS_SESSIONS = 10

export function getVodProxyPort(): number | null {
  return proxyPort
}

function stopHlsSession(sessionId: string): void {
  const session = hlsSessions.get(sessionId)
  if (!session) return
  try { session.ffmpeg.kill('SIGKILL') } catch { /* already dead */ }
  try { fs.rmSync(session.tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  hlsSessions.delete(sessionId)
}

export function stopAllHlsSessions(): void {
  for (const sessionId of hlsSessions.keys()) {
    stopHlsSession(sessionId)
  }
}

/** Poll for a file to exist, up to timeoutMs */
function waitForFile(filePath: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      try { if (fs.statSync(filePath).size > 50) return resolve() } catch { /* not yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${filePath}`))
      setTimeout(check, 200)
    }
    check()
  })
}

export function startVodProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let parsed: URL
      try {
        parsed = new URL(req.url ?? '', 'http://127.0.0.1')
      } catch {
        res.writeHead(400); res.end('Bad request'); return
      }

      // ── POST /hls?url= — start HLS session ───────────────────────────────
      if (parsed.pathname === '/hls' && req.method === 'POST') {
        const targetUrl = parsed.searchParams.get('url')
        if (!targetUrl) { res.writeHead(400); res.end('Missing url'); return }

        let validUrl: string
        try { validUrl = validateStreamUrl(targetUrl) } catch (e) {
          res.writeHead(400); res.end((e as Error).message); return
        }

        if (hlsSessions.size >= MAX_HLS_SESSIONS) {
          const oldest = hlsSessions.keys().next().value as string | undefined
          if (oldest) stopHlsSession(oldest)
        }

        const seekTime = parseFloat(parsed.searchParams.get('seekTime') ?? '0') || 0
        const forceEncode = parsed.searchParams.get('forceEncode') === 'true'

        const sessionId = crypto.randomUUID()
        const tempDir = path.join(os.tmpdir(), `singularity-hls-${sessionId}`)
        fs.mkdirSync(tempDir, { recursive: true })
        const playlistPath = path.join(tempDir, 'playlist.m3u8')

        const seekArgs = seekTime > 0 ? ['-ss', String(seekTime)] : []
        const videoCodecArgs = forceEncode
          ? ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
             '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
             '-profile:v', 'main', '-level:v', '4.1']
          : ['-c:v', 'copy']

        const ffmpeg = spawn(getFFmpegBin(), [
          '-loglevel', 'warning',
          ...seekArgs,
          '-i', validUrl,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-avoid_negative_ts', 'make_zero',
          '-async', '1',
          ...videoCodecArgs,
          '-c:a', 'aac',
          '-b:a', '192k',
          '-hls_time', '6',
          '-hls_list_size', '0',
          '-hls_segment_type', 'fmp4',
          '-hls_fmp4_init_filename', 'init.mp4',
          '-hls_flags', 'temp_file',
          '-f', 'hls',
          playlistPath,
        ])

        ffmpeg.stderr.on('data', (d: Buffer) => {
          const line = d.toString().trim()
          if (line) console.error(`[vodProxy:${sessionId.slice(0, 8)}]`, line)
        })

        ffmpeg.on('error', (err: Error) => {
          console.error('[vodProxy] ffmpeg spawn error:', err.message)
          stopHlsSession(sessionId)
        })

        ffmpeg.on('close', (code) => {
          if (code !== 0 && code !== null) {
            console.error(`[vodProxy] ffmpeg exited with code ${code} for session ${sessionId.slice(0, 8)}`)
          }
        })

        hlsSessions.set(sessionId, { ffmpeg, tempDir })

        // Wait for playlist.m3u8 to appear (up to 15s), then respond
        waitForFile(playlistPath, 15000)
          .then(() => {
            const playlistUrl = `http://127.0.0.1:${proxyPort}/hls-file/${sessionId}/playlist.m3u8`
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(JSON.stringify({ sessionId, playlistUrl }))
          })
          .catch((err) => {
            stopHlsSession(sessionId)
            res.writeHead(504); res.end(err.message)
          })
        return
      }

      // ── DELETE /hls/:sessionId — stop session ─────────────────────────────
      const deleteMatch = parsed.pathname.match(/^\/hls\/([^/]+)$/)
      if (deleteMatch && req.method === 'DELETE') {
        stopHlsSession(deleteMatch[1])
        res.writeHead(204); res.end()
        return
      }

      // ── GET /hls-file/:sessionId/* — serve segment files ─────────────────
      const fileMatch = parsed.pathname.match(/^\/hls-file\/([^/]+)\/(.+)$/)
      if (fileMatch && req.method === 'GET') {
        const sessionId = fileMatch[1]
        const session = hlsSessions.get(sessionId)
        if (!session) { res.writeHead(404); res.end('Session not found'); return }

        // Sanitize file path — only allow .m3u8 and .ts files, no path traversal
        const fileName = path.basename(fileMatch[2])
        if (!/\.(m3u8|ts|mp4|m4s)$/i.test(fileName)) { res.writeHead(403); res.end('Forbidden'); return }

        const filePath = path.join(session.tempDir, fileName)
        if (!filePath.startsWith(session.tempDir)) { res.writeHead(403); res.end('Forbidden'); return }

        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('File not found'); return }
          const contentType = fileName.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : fileName.endsWith('.m4s')
              ? 'video/iso.segment'
              : fileName.endsWith('.mp4')
                ? 'video/mp4'
                : 'video/mp2t'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(data)
        })
        return
      }

      // ── GET /probe?url= — get stream duration ─────────────────────────────
      if (parsed.pathname === '/probe' && req.method === 'GET') {
        const targetUrl = parsed.searchParams.get('url')
        if (!targetUrl) { res.writeHead(400); res.end('Missing url'); return }

        let validProbeUrl: string
        try { validProbeUrl = validateStreamUrl(targetUrl) } catch (e) {
          res.writeHead(400); res.end((e as Error).message); return
        }

        let stderr = ''
        const probe = spawn(getFFmpegBin(), ['-v', 'info', '-i', validProbeUrl, '-f', 'null', '-'])

        probe.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

        let destroyed = false
        req.on('close', () => {
          destroyed = true
          try { probe.kill('SIGKILL') } catch { /* ignore */ }
        })

        const finish = () => {
          if (destroyed) return
          const duration = parseDuration(stderr)
          const videoCodec = parseVideoCodec(stderr)
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ duration, videoCodec }))
        }

        probe.on('close', finish)
        probe.on('error', finish)

        const probeTimer = setTimeout(() => { try { probe.kill('SIGKILL') } catch { /* ignore */ } }, 10000)
        probe.on('close', () => clearTimeout(probeTimer))
        return
      }

      res.writeHead(404); res.end('Not found')
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
  stopAllHlsSessions()
  server?.close()
  server = null
  proxyPort = null
}
