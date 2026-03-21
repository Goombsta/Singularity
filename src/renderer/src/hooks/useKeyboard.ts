import { useEffect } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import type { SidebarView } from '../types'

interface KeyboardOptions {
  onToggleEpg?: () => void
  onToggleMultiview?: () => void
  setSidebarView?: (v: SidebarView) => void
  nextChannel?: () => void
  prevChannel?: () => void
}

export function useKeyboard(opts: KeyboardOptions = {}): void {
  const player = usePlayerStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Don't capture when typing in inputs
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (player.isPlaying) player.pause()
          else player.resume()
          break
        case 'f':
        case 'F':
          player.setFullscreen(!player.isFullscreen)
          break
        case 'm':
        case 'M':
          player.toggleMute()
          break
        case 'ArrowUp':
          e.preventDefault()
          player.setVolume(Math.min(1, player.volume + 0.05))
          break
        case 'ArrowDown':
          e.preventDefault()
          player.setVolume(Math.max(0, player.volume - 0.05))
          break
        case 'ArrowRight':
          if (opts.nextChannel) opts.nextChannel()
          break
        case 'ArrowLeft':
          if (opts.prevChannel) opts.prevChannel()
          break
        case 'e':
        case 'E':
          if (opts.setSidebarView) opts.setSidebarView('epg')
          break
        case 'Escape':
          if (player.isFullscreen) player.setFullscreen(false)
          break
      }

      if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        player.toggleMultiview()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [player, opts])
}
