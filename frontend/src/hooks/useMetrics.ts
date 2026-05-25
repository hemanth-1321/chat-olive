import { useState, useEffect } from 'react'
import { getSessionId } from '@/lib/session'

export interface MetricsOverview {
  total_requests: number
  successful: number
  errors: number
  error_rate: number
  avg_latency_ms: number
  p95_latency_ms: number
  avg_ttft_ms: number
  total_tokens: number
  total_cost_usd: number
}

export interface ThroughputPoint {
  minute: string
  requests: number
  tokens: number
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useMetrics() {
  const [overview, setOverview] = useState<MetricsOverview | null>(null)
  const [throughput, setThroughput] = useState<ThroughputPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ov, tp] = await Promise.all([
          fetch(`${API}/api/metrics/overview`, { headers: { 'x-session-id': getSessionId() } }).then(r => r.json()),
          fetch(`${API}/api/metrics/throughput`, { headers: { 'x-session-id': getSessionId() } }).then(r => r.json()),
        ])
        setOverview(ov)
        setThroughput(tp)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    const id = setInterval(fetchAll, 5000)
    return () => clearInterval(id)
  }, [])

  return { overview, throughput, loading }
}
