import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
