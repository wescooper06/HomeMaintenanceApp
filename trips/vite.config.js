import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sharedNavPlugin } from './shared-nav-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sharedNavPlugin()],
  base: '/trips/',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../www/trips',
    emptyOutDir: true,
  },
})
