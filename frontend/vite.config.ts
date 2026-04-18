import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devProxy = {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true
  },
  '/docs': {
    target: 'http://localhost:4000',
    changeOrigin: true
  }
} as const

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Local demo only: allow Cloudflare quick tunnel hostnames.
    allowedHosts: ['.trycloudflare.com'],
    proxy: { ...devProxy }
  },
  preview: {
    port: 3000,
    proxy: { ...devProxy }
  }
})
