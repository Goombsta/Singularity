/**
 * afterPack.js — electron-builder hook
 *
 * Replaces Electron's stripped-down ffmpeg.dll with the full-codec NW.js prebuilt,
 * enabling AC3, EAC3 (Dolby Digital), DTS, and other proprietary audio codecs
 * that Electron's default Chromium FFmpeg omits.
 *
 * Electron 33.x uses Chromium 130, which matches NW.js 0.93.x prebuilt FFmpeg.
 *
 * Only runs on win32 builds. Safe to skip on other platforms (macOS/Linux use
 * different library names and package differently).
 */

const path = require('path')
const fs = require('fs')
const https = require('https')
const { execSync } = require('child_process')
const os = require('os')

// NW.js prebuilt version that matches Electron 33.x / Chromium 130
const NWJS_FFMPEG_VERSION = '0.93.0'
const FFMPEG_ZIP_URL = `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${NWJS_FFMPEG_VERSION}/${NWJS_FFMPEG_VERSION}-win-x64.zip`

/**
 * Download a file, following up to 5 HTTP redirects.
 */
function downloadFile(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects downloading ffmpeg prebuilt'))
      return
    }

    const file = fs.createWriteStream(destPath)

    https
      .get(url, (response) => {
        // Follow redirects (GitHub releases use 302→CDN)
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          file.close()
          fs.unlink(destPath, () => {})
          downloadFile(response.headers.location, destPath, redirectCount + 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (response.statusCode !== 200) {
          file.close()
          fs.unlink(destPath, () => {})
          reject(new Error(`HTTP ${response.statusCode} downloading FFmpeg prebuilt`))
          return
        }

        response.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', (err) => {
          fs.unlink(destPath, () => {})
          reject(err)
        })
      })
      .on('error', (err) => {
        fs.unlink(destPath, () => {})
        reject(err)
      })
  })
}

/**
 * Recursively find a file by name inside a directory.
 */
function findFile(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename)
      if (found) return found
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath
    }
  }
  return null
}

module.exports = async function afterPack(context) {
  // Only replace on Windows
  if (context.electronPlatformName !== 'win32') return

  const appOutDir = context.appOutDir
  const ffmpegDest = path.join(appOutDir, 'ffmpeg.dll')

  if (!fs.existsSync(ffmpegDest)) {
    console.warn('[afterPack] ffmpeg.dll not found in output — skipping codec replacement')
    return
  }

  const tmpDir = path.join(os.tmpdir(), `singularity-ffmpeg-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const zipPath = path.join(tmpDir, 'nwjs-ffmpeg.zip')
  const extractDir = path.join(tmpDir, 'extracted')

  try {
    console.log(`[afterPack] Downloading full-codec FFmpeg (NW.js ${NWJS_FFMPEG_VERSION})...`)
    await downloadFile(FFMPEG_ZIP_URL, zipPath)

    console.log('[afterPack] Extracting...')
    fs.mkdirSync(extractDir, { recursive: true })
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'"`,
      { stdio: 'pipe' }
    )

    const ffmpegSrc = findFile(extractDir, 'ffmpeg.dll')
    if (!ffmpegSrc) {
      throw new Error('ffmpeg.dll not found inside downloaded NW.js zip')
    }

    // Back up original (helpful for debugging)
    fs.copyFileSync(ffmpegDest, ffmpegDest + '.orig')

    fs.copyFileSync(ffmpegSrc, ffmpegDest)
    console.log(`[afterPack] Replaced ffmpeg.dll — AC3/EAC3/DTS audio codecs now available`)
  } catch (err) {
    // Non-fatal: warn but don't fail the build
    console.warn(`[afterPack] Could not replace ffmpeg.dll: ${err.message}`)
    console.warn('[afterPack] Build will continue but AC3/EAC3 audio may not work.')
    console.warn('[afterPack] To fix manually, replace ffmpeg.dll with the NW.js 0.93.0 prebuilt.')
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}
