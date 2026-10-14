import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// Settings previously showed a hardcoded "v1.0", which was simply untrue. Read it
// from package.json so there is one source of truth and it cannot drift again.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
