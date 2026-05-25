import { useState, useEffect, useCallback } from 'react'

export interface Conversation {
  id: string
  title: string
  model: string
  status: string
  updated_at: string
  messages?: { role: string; content: string }[]
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/conversations/`, { credentials: 'include' })
      setConversations(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await refresh()
    })()
  }, [refresh])

  const cancelConversation = useCallback(async (id: string) => {
    await fetch(`${API}/api/conversations/${id}/cancel`, { method: 'PATCH', credentials: 'include' })
    refresh()
  }, [refresh])

  const deleteConversation = useCallback(async (id: string) => {
    await fetch(`${API}/api/conversations/${id}`, { method: 'DELETE', credentials: 'include' })
    refresh()
  }, [refresh])

  const getConversation = useCallback(async (id: string): Promise<Conversation | null> => {
    try {
      const res = await fetch(`${API}/api/conversations/${id}`, { credentials: 'include' })
      return await res.json()
    } catch { return null }
  }, [])

  return { conversations, loading, refresh, cancelConversation, deleteConversation, getConversation }
}
