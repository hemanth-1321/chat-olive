import { Plus, X, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Conversation } from '@/hooks/useConversations'

interface SidebarProps {
  conversations: Conversation[]
  loading?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  open: boolean
  onClose: () => void
}

export function Sidebar({ conversations, loading, selectedId, onSelect, onNew, onCancel, onDelete, open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />}
      <aside className={`fixed md:static z-50 top-0 left-0 h-full w-[280px] bg-card border-r border-border flex flex-col overflow-hidden transition-transform duration-150 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="shrink-0 h-[55px] px-4 flex items-center justify-between border-b border-border">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={onNew}><Plus className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="md:hidden" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
            ) : conversations.map(c => (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`p-3 rounded-md cursor-pointer transition-colors duration-150 group ${selectedId === c.id ? 'bg-accent' : 'hover:bg-accent/50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate flex-1">{c.title || 'New chat'}</span>
                  {c.status === 'active' && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); onCancel(c.id) }}>
                      <Square className="w-3 h-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); onDelete(c.id) }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.model?.split('/').pop()}</Badge>
                  <span className="text-[10px] text-muted-foreground">{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
