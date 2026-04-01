/**
 * download-mpv.js — fetches the latest MPV Windows x64 binary before build
 *
 * Downloads the latest release from github.com/mpv-player/mpv, extracts
 * mpv.exe from the zip archive using 7zip-bin (bundled with electron-builder),
 * and places it at resources/win/mpv.exe.
 *
 * Skips silently if mpv.exe already exists (avoids re-downloading on every build).
 * Run via: node scripts/download-mpv.js
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const OUT_DIR = path.join(__dirname, '..', 'resources', 'win')
const OUT_PATH = path.join(OUT_DIR, 'mpv.exe')

if (fs.existsSync(OUT_PATH)) {
  console.log('[download-mpv] mpv.exe already present, skipping.')
  process.exit(0)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) return reject(new Error('Too many redirects'))
    https.get(url, { headers: { 'User-Agent': 'singularity-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, redirects - 1))
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

;(async () => {
  console.log('[download-mpv] Fetching latest MPV release info...')
  const releaseJson = await get('https://api.github.com/repos/mpv-player/mpv/releases/latest')
  const release = JSON.parse(releaseJson.toString())

  // Prefer x86_64-pc-windows-msvc zip (newer releases), fall back to mingw zip
  const asset =
    release.assets.find((a) => a.name.includes('x86_64-pc-windows-msvc') && a.name.endsWith('.zip')) ||
    release.assets.find((a) => a.name.includes('x86_64') && a.name.endsWith('.zip'))

  if (!asset) {
    console.error('[download-mpv] No x86_64 Windows .zip asset found in latest release.')
    console.error('Assets:', release.assets.map((a) => a.name).join(', '))
    process.exit(1)
  }

  console.log(`[download-mpv] Downloading ${asset.name} (${Math.round(asset.size / 1024 / 1024)}MB)...`)
  const archiveBuf = await get(asset.browser_download_url)

  const tmpArchive = path.join(os.tmpdir(), asset.name)
  fs.writeFileSync(tmpArchive, archiveBuf)

  // Use 7za from electron-builder's bundled 7zip-bin to extract the zip
  let sevenBinPath
  try {
    sevenBinPath = require('7zip-bin').path7za
  } catch {
    const candidate = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
    if (!fs.existsSync(candidate)) {
      console.error('[download-mpv] 7zip-bin not found. Run: npm install')
      process.exit(1)
    }
    sevenBinPath = candidate
  }

  const tmpExtract = path.join(os.tmpdir(), `mpv-extract-${Date.now()}`)
  fs.mkdirSync(tmpExtract, { recursive: true })

  console.log('[download-mpv] Extracting mpv.exe...')
  execFileSync(sevenBinPath, ['e', tmpArchive, `-o${tmpExtract}`, 'mpv.exe', '-r', '-y'], {
    stdio: 'inherit',
  })

  const extracted = path.join(tmpExtract, 'mpv.exe')
  let sourcePath = fs.existsSync(extracted) ? extracted : findFile(tmpExtract, 'mpv.exe')

  if (!sourcePath) {
    console.error('[download-mpv] mpv.exe not found in archive.')
    process.exit(1)
  }

  fs.copyFileSync(sourcePath, OUT_PATH)

  // Cleanup
  try { fs.rmSync(tmpArchive) } catch { /**/ }
  try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch { /**/ }

  console.log(`[download-mpv] mpv.exe written to ${OUT_PATH}`)
})().catch((err) => {
  console.error('[download-mpv] Error:', err.message)
  process.exit(1)
})
