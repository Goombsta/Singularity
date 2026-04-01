/**
 * mpvService.ts — MPV native player integration
 *
 * Spawns mpv.exe as an always-on-top frameless window positioned over the
 * player div. Communication is via MPV's JSON IPC named pipe.
 *
 * MPV is not bundled. Detection order:
 *   1. User-configured external player with "mpv" in the name
 *   2. Common Windows install locations
 *   3. "mpv" on PATH (spawn falls through on error)
 */

import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'

const PIPE_PATH = '\\\\.\\pipe\\singularity-mpv'

let mpvProcess: ChildProcess | null = null
let ipcClient: net.Socket | null = null
let requestId = 1
const pendingCallbacks = new Map<number, (val: unknown) => void>()
let timePosCallback: ((t: number) => void) | null = null

export function setTimePosCallback(cb: (t: number) => void): void {
  timePosCallback = cb
}

function findMpv(externalPlayers: { name: string; path: string }[]): string {
  // 1. Bundled binary (extraResources → process.resourcesPath/mpv.exe)
  const bundled = path.join(process.resourcesPath ?? '', 'mpv.exe')
  if (fs.existsSync(bundled)) return bundled

  // 2. User-configured external player
  const configured = externalPlayers.find((p) => p.name.toLowerCase().includes('mpv'))
  if (configured && fs.existsSync(configured.path)) return configured.path

  // 3. Common install locations
  const candidates = [
    'C:\\Program Files\\mpv\\mpv.exe',
    'C:\\Program Files (x86)\\mpv\\mpv.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'mpv', 'mpv.exe'),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c

  return 'mpv' // hope it's on PATH
}

export function startMpv(
  url: string,
  bounds: { x: number; y: number; width: number; height: number },
  externalPlayers: { name: string; path: string }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    stopMpv()
    const mpvBin = findMpv(externalPlayers)

    mpvProcess = spawn(
      mpvBin,
      [
        '--no-border',
        '--ontop',
        '--force-window=yes',
        `--geometry=${bounds.width}x${bounds.height}+${bounds.x}+${bounds.y}`,
        `--input-ipc-server=${PIPE_PATH}`,
        url,
      ],
      { detached: false },
    )

    mpvProcess.on('error', (err) => reject(new Error(`MPV not found: ${err.message}`)))
    mpvProcess.on('close', () => {
      mpvProcess = null
      ipcClient = null
    })

    // Poll until MPV creates the named pipe, then connect
    let attempts = 0
    const tryConnect = (): void => {
      if (attempts++ > 40) return reject(new Error('MPV IPC socket timeout'))
      const sock = net.connect(PIPE_PATH)
      sock.once('connect', () => {
        ipcClient = sock
        let buf = ''
        sock.on('data', (d: Buffer) => {
          buf += d.toString()
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line) as Record<string, unknown>
              if (
                msg.event === 'property-change' &&
                msg.name === 'time-pos' &&
                typeof msg.data === 'number'
              ) {
                timePosCallback?.(msg.data)
              }
              if (typeof msg.request_id === 'number' && pendingCallbacks.has(msg.request_id)) {
                pendingCallbacks.get(msg.request_id)!(msg.data)
                pendingCallbacks.delete(msg.request_id)
              }
            } catch {
              /* ignore malformed lines */
            }
          }
        })
        // Start streaming time position updates
        sendCommand(['observe_property', 1, 'time-pos'])
        resolve()
      })
      sock.once('error', () => {
        sock.destroy()
        setTimeout(tryConnect, 250)
      })
    }
    setTimeout(tryConnect, 500)
  })
}

function sendCommand(args: unknown[]): void {
  if (!ipcClient) return
  ipcClient.write(JSON.stringify({ command: args, request_id: requestId++ }) + '\n')
}

export function seekMpv(t: number): void {
  sendCommand(['seek', t, 'absolute'])
}

export function pauseMpv(): void {
  sendCommand(['set_property', 'pause', true])
}

export function resumeMpv(): void {
  sendCommand(['set_property', 'pause', false])
}

export function getMpvDuration(): Promise<number | null> {
  return new Promise((resolve) => {
    if (!ipcClient) return resolve(null)
    const id = requestId++
    pendingCallbacks.set(id, (v) => resolve(typeof v === 'number' ? v : null))
    ipcClient.write(JSON.stringify({ command: ['get_property', 'duration'], request_id: id }) + '\n')
    setTimeout(() => {
      pendingCallbacks.delete(id)
      resolve(null)
    }, 3000)
  })
}

export function setBoundsMpv(b: { x: number; y: number; width: number; height: number }): void {
  sendCommand(['set_property', 'geometry', `${b.width}x${b.height}+${b.x}+${b.y}`])
}

export function hideMpv(): void {
  sendCommand(['set_property', 'window-minimized', true])
}

export function showMpv(): void {
  sendCommand(['set_property', 'window-minimized', false])
}

export function stopMpv(): void {
  if (ipcClient) {
    try { sendCommand(['quit']) } catch { /**/ }
    try { ipcClient.destroy() } catch { /**/ }
    ipcClient = null
  }
  if (mpvProcess) {
    try { mpvProcess.kill('SIGKILL') } catch { /**/ }
    mpvProcess = null
  }
  timePosCallback = null
}
