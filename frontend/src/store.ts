import { create } from 'zustand'
import type { Message } from '@/hooks/useChat'

interface AppState {
  selectedId: string | null
  initialMessages: Message[]
  activeTab: string
  setSelectedId: (id: string | null) => void
  setInitialMessages: (msgs: Message[]) => void
  setActiveTab: (tab: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedId: null,
  initialMessages: [],
  activeTab: 'chat',
  setSelectedId: (id) => set({ selectedId: id }),
  setInitialMessages: (msgs) => set({ initialMessages: msgs }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
