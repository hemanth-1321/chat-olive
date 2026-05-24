import { useState, useRef, useEffect } from 'react'
import { Send, StopCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { ModelPicker } from './ModelPicker'
import { useChat, type Message } from '@/hooks/useChat'

interface ChatWindowProps {
  conversationId: string | null
  initialMessages?: Message[]
  onConversationCreated?: () => void
}

export function ChatWindow({ conversationId, initialMessages, onConversationCreated }: ChatWindowProps) {
  const { messages, isStreaming, sendMessage, abort, reset } = useChat()
  const [input, setInput] = useState('')
  const [model, setModel] = useState('llama-3.3-70b-versatile')
  const messagesViewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    reset(initialMessages || [], conversationId)
  }, [conversationId, initialMessages, reset])

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim(), model)
    setInput('')
    onConversationCreated?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={messagesViewportRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm pt-20">
              Start a conversation...
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-zinc-700 text-zinc-100' : 'bg-card border border-border'}`}>
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                    {isStreaming && m === messages.at(-1) && (
                      <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse ml-1" />
                    )}
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-4 pt-4 pb-6">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Send a message..."
              rows={2}
              className="flex-1 resize-none bg-card border border-border rounded-md px-4 py-3 text-sm leading-6 min-h-14 max-h-40 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
            />
            {isStreaming ? (
              <Button variant="destructive" className="h-14 w-14 shrink-0" onClick={abort}><StopCircle className="w-5 h-5" /></Button>
            ) : (
              <Button className="h-14 w-14 shrink-0" onClick={handleSend} disabled={!input.trim()}><Send className="w-5 h-5" /></Button>
            )}
          </div>
          <ModelPicker value={model} onChange={setModel} />
        </div>
      </div>
    </div>
  )
}
