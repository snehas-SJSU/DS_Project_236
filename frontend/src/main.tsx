import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * Empty = same-origin `/api` (Vite dev server proxies to FastAPI on :4000).
 * Set VITE_API_BASE_URL when the UI and API are on different origins (e.g. production).
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
const LEGACY_GATEWAY = 'http://localhost:4000'
const originalFetch = globalThis.fetch.bind(globalThis)

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') {
    if (input.startsWith(LEGACY_GATEWAY)) {
      const path = input.slice(LEGACY_GATEWAY.length)
      const url = API_BASE ? `${API_BASE}${path}` : path
      return originalFetch(url, init)
    }
    if (input.startsWith('/api/') || input === '/docs' || input.startsWith('/docs?')) {
      const url = API_BASE ? `${API_BASE}${input}` : input
      return originalFetch(url, init)
    }
  }
  return originalFetch(input as RequestInfo, init)
}) as typeof fetch

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
