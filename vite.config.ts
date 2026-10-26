import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  base: "./", // relative Pfade: dist/ läuft in Root UND Unterordnern
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'tinkeredu – Noten-App',
        short_name: 'tinkeredu',
        description: 'Offline-Notenerfassung für Lehrkräfte',
        lang: 'de',
        theme_color: '#2563eb',
        background_color: '#fafafa',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
