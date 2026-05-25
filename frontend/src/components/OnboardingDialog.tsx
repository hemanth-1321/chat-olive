import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setUsername } from '@/lib/session'

interface Props {
  open: boolean
  onComplete: () => void
}

export function OnboardingDialog({ open, onComplete }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-')
    if (!trimmed) return
    setUsername(trimmed)
    onComplete()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Olive</DialogTitle>
          <DialogDescription>Enter a username to get started. Your conversations will be saved under this name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="your-name"
              autoFocus
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">@olive</span>
          </div>
          <Button type="submit" className="w-full" disabled={!name.trim()}>
            Start chatting
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
