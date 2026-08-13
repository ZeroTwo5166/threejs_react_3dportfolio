import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api/contact only exists on the separate Express server (server.mjs).
    // Proxy it here so `npm run dev` doesn't 404 — run `node server.mjs`
    // alongside `npm run dev` (with RESEND_API_KEY/CONTACT_TO set) to
    // actually test the contact form locally.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    // The three.js vendor chunk is inherently >500kB — that's expected
    // and desired here (see manualChunks below), not a regression.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // React and Three.js/R3F rarely change together with app code —
        // splitting them into their own chunks means a deploy that only
        // touches app code doesn't invalidate the browser's cache of the
        // (much larger, rarely-changing) vendor code.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // Check "three" first — @react-three/fiber and @react-three/drei
          // both contain the substring "react" too.
          if (id.includes('three')) return 'three'
          if (id.includes('react')) return 'react'
        },
      },
    },
  },
})
