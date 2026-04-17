import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Allow Cloudflare quick tunnels (*.trycloudflare.com) during demos.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:4000', // Proxy to API Gateway
        changeOrigin: true
      }
    }
  }
})
