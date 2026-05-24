import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Model {
  id: string
  provider: string
}

export function ModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [models, setModels] = useState<Model[]>([])

  useEffect(() => {
    fetch(`${API}/api/models`).then(r => r.json()).then(setModels).catch(() => {})
  }, [])

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[220px] h-8 text-xs">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models.map(m => (
          <SelectItem key={m.id} value={m.id}>
            <span className="text-muted-foreground text-xs mr-1.5">{m.provider}</span>
            {m.id.split('/').pop()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
