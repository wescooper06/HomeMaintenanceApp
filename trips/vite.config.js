import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { assertProductionSupabaseConfig } from './supabaseBuildConfig.mjs'

const require = createRequire(import.meta.url)
const envDir = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode === 'production') {
    assertProductionSupabaseConfig(loadEnv(mode, envDir, ''))
  }

  return {
    envDir,
    plugins: [react()],
    base: './',
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
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
    build: {
      outDir: '../dist/trips',
      emptyOutDir: true,
    },
  }
})
