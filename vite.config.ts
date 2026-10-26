import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub supplies owner/repository in Actions. Override for a custom domain.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'A'
const base = process.env.VITE_BASE_PATH ?? (repository.endsWith('.github.io') ? '/' : `/${repository}/`)

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'brand/*.svg'],
      manifest: {
        id: base,
        name: 'AEHA',
        short_name: 'AEHA',
        description: 'Habit tracker',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f5f3',
        theme_color: '#304565',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
