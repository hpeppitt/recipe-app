import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Settings previously showed a hardcoded "v1.0", which was simply untrue. Read it
// from package.json so there is one source of truth and it cannot drift again.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new worker waits until the user taps Reload. Never auto-update.
      registerType: 'prompt',
      manifest: {
        name: 'Recipe Lab', // keep equal to APP_NAME in src/lib/constants.ts
        short_name: 'Recipe Lab',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Both are the light --color-surface (#f5ead8, Organic cream). The app is light only (RL-065),
        // and index.html carries the same single theme-color meta.
        theme_color: '#f5ead8',
        background_color: '#f5ead8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Shell and hashed assets only. No runtimeCaching: Firestore, Auth and the
        // AI endpoints are never cached by the worker.
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        navigateFallback: '/index.html',
        // /__/ is Firebase Auth's handler, /api/ is reserved for APIs, and /_ skips any
        // underscore-prefixed path (the app has none).
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//, /^\/_/],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  build: {
    rollupOptions: {
      output: {
        // Own cacheable chunk; services/ imports Firebase statically so it still loads at start.
        manualChunks: (id: string) =>
          id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')
            ? 'firebase'
            : undefined,
      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
