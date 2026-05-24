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
  const [model, setModel] = useState('meta-llama/llama-3.3-70b-instruct:free')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    reset(initialMessages || [], conversationId)
  }, [conversationId, initialMessages, reset])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim(), model)
    setInput('')
    onConversationCreated?.()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-3 border-b border-border flex items-center gap-3">
        <ModelPicker value={model} onChange={setModel} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
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
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 p-5 border-t border-border">
        <div className="max-w-4xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Send a message..."
            className="flex-1 min-h-12 bg-card border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
          />
          {isStreaming ? (
            <Button size="icon" variant="destructive" onClick={abort}><StopCircle className="w-4 h-4" /></Button>
          ) : (
            <Button size="icon" onClick={handleSend} disabled={!input.trim()}><Send className="w-4 h-4" /></Button>
          )}
        </div>
      </div>
    </div>
  )
}
