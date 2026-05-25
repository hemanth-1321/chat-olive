import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMetrics } from '@/hooks/useMetrics'

export function Dashboard() {
  const { overview, throughput, loading } = useMetrics()

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  if (!overview) return <div className="p-8 text-muted-foreground">No data available</div>

  const cards = [
    { label: 'Total Requests', value: overview.total_requests.toLocaleString() },
    { label: 'Error Rate', value: `${overview.error_rate.toFixed(1)}%` },
    { label: 'Avg Latency', value: `${overview.avg_latency_ms.toFixed(0)}ms` },
    { label: 'P95 Latency', value: `${overview.p95_latency_ms.toFixed(0)}ms` },
    { label: 'Total Tokens', value: overview.total_tokens.toLocaleString() },
    { label: 'Total Cost', value: `$${overview.total_cost_usd.toFixed(4)}` },
  ]

  const maxReqs = Math.max(...throughput.map(t => t.requests), 1)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h2 className="text-lg font-semibold">Metrics Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-medium">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Throughput (requests/min)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {throughput.slice(-30).map((t, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full bg-primary/80 rounded-t transition-all duration-150"
                  style={{ height: `${(t.requests / maxReqs) * 100}%`, minHeight: t.requests > 0 ? '2px' : '0' }}
                />
              </div>
            ))}
          </div>
          {throughput.length === 0 && <p className="text-sm text-muted-foreground">No throughput data</p>}
        </CardContent>
      </Card>
    </div>
  )
}
