import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

function intEnv(key: string, fallback: number): number {
  const v = import.meta.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: intEnv('VITE_QUERY_RETRY', 1),
      refetchOnWindowFocus: false,
      staleTime: intEnv('VITE_QUERY_STALE_TIME', 30_000),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
