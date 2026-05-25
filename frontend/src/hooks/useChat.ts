import { useState, useRef, useCallback } from 'react'
import { getSessionId } from '@/lib/session'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (message: string, model: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: message }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${API}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
        body: JSON.stringify({ message, model, conversation_id: conversationId }),
        signal: controller.signal,
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.done) {
            setConversationId(data.conversation_id)
          } else if (data.error) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: data.error, isError: true } : m)
            )
          } else if (data.chunk) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: m.content + data.chunk } : m)
            )
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [conversationId])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback((msgs?: Message[], convId?: string | null) => {
    setMessages(msgs || [])
    setConversationId(convId ?? null)
  }, [])

  return { messages, isStreaming, sendMessage, abort, conversationId, reset }
}
