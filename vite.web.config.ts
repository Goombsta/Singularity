import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))

export default defineConfig({
  root: resolve('src/renderer'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve('dist/renderer'),
    emptyOutDir: true
  }
})
