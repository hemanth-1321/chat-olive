import { useState, useRef, useCallback } from 'react'
import { getSessionId } from '@/lib/session'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_DELAY = 15 // ms per chunk — similar to GPT/Claude speed

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamMetaRef = useRef<{ conversationId: string; messageId: string; chunks: string[] } | null>(null)

  const sendMessage = useCallback(async (message: string, model: string) => {
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: message }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller
    streamMetaRef.current = null

    const allChunks: string[] = []
    let displayed = ''
    let currentConvId = ''
    let currentMsgId = ''

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
            streamMetaRef.current = null
          } else if (data.conversation_id && data.message_id && !data.chunk) {
            setConversationId(data.conversation_id)
            currentConvId = data.conversation_id
            currentMsgId = data.message_id
            streamMetaRef.current = { conversationId: data.conversation_id, messageId: data.message_id, chunks: allChunks }
          } else if (data.error) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: data.error, isError: true } : m)
            )
          } else if (data.chunk) {
            allChunks.push(data.chunk)
          }
        }

        // Render chunks with delay
        while (allChunks.join('').length > displayed.length) {
          const full = allChunks.join('')
          const next = full.slice(displayed.length, displayed.length + 3)
          displayed += next
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: displayed } : m)
          )
          await delay(TOKEN_DELAY)
        }
      }
      // Flush remaining
      const full = allChunks.join('')
      while (displayed.length < full.length) {
        const next = full.slice(displayed.length, displayed.length + 3)
        displayed += next
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: displayed } : m)
        )
        await delay(TOKEN_DELAY)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error(e)
      // Save partial message on cancel
      if (currentConvId && displayed) {
        fetch(`${API}/api/chat/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
          body: JSON.stringify({ conversation_id: currentConvId, message_id: currentMsgId, content: displayed }),
        }).catch(() => {})
      }
      streamMetaRef.current = null
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
