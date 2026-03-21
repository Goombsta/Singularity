/**
 * afterPack.js — electron-builder hook
 *
 * Replaces Electron's stripped-down FFmpeg with the full-codec NW.js prebuilt,
 * enabling AC3, EAC3 (Dolby Digital), DTS, and other proprietary audio codecs
 * that Electron's default Chromium FFmpeg omits.
 *
 * Electron 33.x uses Chromium 130, which matches NW.js 0.93.x prebuilt FFmpeg.
 *
 * Platform support:
 *   win32  → replaces ffmpeg.dll
 *   darwin → replaces libffmpeg.dylib inside the .app bundle (arm64)
 */

const path = require('path')
const fs = require('fs')
const https = require('https')
const { execSync } = require('child_process')
const os = require('os')

const NWJS_VERSION = '0.93.0'

const PLATFORM_CONFIG = {
  win32: {
    url: `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${NWJS_VERSION}/${NWJS_VERSION}-win-x64.zip`,
    libName: 'ffmpeg.dll',
    // Destination is resolved at runtime: path.join(appOutDir, 'ffmpeg.dll')
    getDestPath: (appOutDir) => path.join(appOutDir, 'ffmpeg.dll'),
  },
  darwin: {
    url: `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${NWJS_VERSION}/${NWJS_VERSION}-osx-arm64.zip`,
    libName: 'libffmpeg.dylib',
    // Destination inside the macOS .app bundle
    getDestPath: (appOutDir) =>
      path.join(appOutDir, 'Singularity.app', 'Contents', 'Frameworks', 'libffmpeg.dylib'),
  },
}

/**
 * Download a file from a URL, following up to 5 HTTP redirects.
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
        if ([301, 302, 307].includes(response.statusCode)) {
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

/**
 * Extract a zip archive cross-platform:
 *   Windows → PowerShell Expand-Archive
 *   macOS/Linux → unzip (available by default)
 */
function extractZip(zipPath, destDir) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`,
      { stdio: 'pipe' }
    )
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' })
  }
}

module.exports = async function afterPack(context) {
  const platformName = context.electronPlatformName
  const config = PLATFORM_CONFIG[platformName]

  if (!config) {
    // Linux or other — skip (no prebuilt available)
    return
  }

  const ffmpegDest = config.getDestPath(context.appOutDir)

  if (!fs.existsSync(ffmpegDest)) {
    console.warn(`[afterPack] ${config.libName} not found in output — skipping codec replacement`)
    return
  }

  const tmpDir = path.join(os.tmpdir(), `singularity-ffmpeg-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const zipPath = path.join(tmpDir, 'nwjs-ffmpeg.zip')
  const extractDir = path.join(tmpDir, 'extracted')

  try {
    console.log(`[afterPack] Downloading full-codec FFmpeg (NW.js ${NWJS_VERSION}) for ${platformName}...`)
    await downloadFile(config.url, zipPath)

    console.log('[afterPack] Extracting...')
    fs.mkdirSync(extractDir, { recursive: true })
    extractZip(zipPath, extractDir)

    const ffmpegSrc = findFile(extractDir, config.libName)
    if (!ffmpegSrc) {
      throw new Error(`${config.libName} not found inside downloaded NW.js zip`)
    }

    fs.copyFileSync(ffmpegSrc, ffmpegDest)
    console.log(`[afterPack] Replaced ${config.libName} — AC3/EAC3/DTS audio codecs now available`)
  } catch (err) {
    // Non-fatal: warn but don't fail the build
    console.warn(`[afterPack] Could not replace ${config.libName}: ${err.message}`)
    console.warn('[afterPack] Build will continue but AC3/EAC3 audio may not work.')
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}
