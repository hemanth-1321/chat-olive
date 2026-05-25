import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getSessionId } from '@/lib/session'

interface LogEntry {
  id: string
  timestamp: string
  model: string
  status: string
  latency_ms: number
  ttft_ms: number | null
  total_tokens: number
  estimated_cost_usd: number
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function LogsTable() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [model, setModel] = useState('')
  const [status, setStatus] = useState('')

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100', offset: '0' })
    if (model) params.set('model', model)
    if (status) params.set('status', status)
    try {
      const res = await fetch(`${API}/api/logs/?${params}`, { headers: { 'x-session-id': getSessionId() } })
      setLogs(await res.json())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [model, status])

  useEffect(() => {
    void (async () => {
      await fetchLogs()
    })()
  }, [fetchLogs])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold flex-1">Inference Logs</h2>
        <Select value={model} onValueChange={v => setModel(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All models" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            <SelectItem value="llama-3.3-70b-versatile">Llama 3.3 70B</SelectItem>
            <SelectItem value="llama-3.1-8b-instant">Llama 3.1 8B</SelectItem>
            <SelectItem value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</SelectItem>
            <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
            <SelectItem value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => setStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="text-right">TTFT</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{log.model?.split('/').pop()}</TableCell>
                <TableCell>
                  <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs">{Math.round(log.latency_ms)}ms</TableCell>
                <TableCell className="text-right text-xs">{log.ttft_ms ? `${Math.round(log.ttft_ms)}ms` : '—'}</TableCell>
                <TableCell className="text-right text-xs">{log.total_tokens}</TableCell>
                <TableCell className="text-right text-xs">${log.estimated_cost_usd?.toFixed(5)}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No logs found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
