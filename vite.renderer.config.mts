import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only dev server for previewing the UI in a plain browser
// (window.api is provided by src/renderer/src/lib/browserMock.ts).
export default defineConfig({
  root: 'src/renderer',
  server: { port: 5233, strictPort: true },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [react()],
})
