import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const LOCALHOST_API = 'http://localhost:4000';
const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string') {
    if (input.startsWith(LOCALHOST_API)) {
      return originalFetch(`${API_BASE}${input.slice(LOCALHOST_API.length)}`, init);
    }
    if (input.startsWith('/api/')) {
      return originalFetch(`${API_BASE}${input}`, init);
    }
  }
  return originalFetch(input as RequestInfo, init);
}) as typeof fetch;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
