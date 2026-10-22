import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createRequire } from 'node:module'
import { sharedNavPlugin } from './shared-nav-plugin.js'

const require = createRequire(import.meta.url)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sharedNavPlugin()],
  base: '/trips/',
  resolve: {
    alias: [
      'react', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-dom', 'react-dom/client', 'react-router', 'react-router/dom', 'react-router-dom',
      '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'lucide-react',
    ].map((name) => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) })),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../www/trips',
    emptyOutDir: true,
  },
})
