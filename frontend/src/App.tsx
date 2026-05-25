import { useState, useEffect } from 'react'
import { Menu, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sidebar } from '@/components/Sidebar'
import { ChatWindow } from '@/components/ChatWindow'
import { Dashboard } from '@/components/Dashboard'
import { LogsTable } from '@/components/LogsTable'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { useConversations } from '@/hooks/useConversations'
import { getUsername } from '@/lib/session'
import type { Message } from '@/hooks/useChat'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ollive_theme')
    return saved ? saved === 'dark' : true
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<Message[]>([])
  const [onboarded, setOnboarded] = useState(() => !!getUsername())
  const { conversations, refresh, cancelConversation, deleteConversation, getConversation } = useConversations()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('ollive_theme', dark ? 'dark' : 'light')
  }, [dark])

  const handleSelect = async (id: string) => {
    setSelectedId(id)
    setSidebarOpen(false)
    const conv = await getConversation(id)
    if (conv?.messages) {
      setInitialMessages(conv.messages.map((m, i) => ({ id: String(i), role: m.role as 'user' | 'assistant', content: m.content })))
    }
  }

  const handleNew = () => {
    setSelectedId(null)
    setInitialMessages([])
    setSidebarOpen(false)
  }

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <OnboardingDialog open={!onboarded} onComplete={() => setOnboarded(true)} />
      <Sidebar
        conversations={conversations}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
        onCancel={cancelConversation}
        onDelete={async (id) => { await deleteConversation(id); if (selectedId === id) handleNew() }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 flex h-screen min-h-0 min-w-0 flex-col overflow-hidden">
        <Tabs defaultValue="chat" className="flex-1 flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 h-[57px] border-b border-border px-4 flex items-center gap-4">
            <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <TabsList variant="line" className="bg-transparent border-0 h-10 gap-2">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <div className="ml-auto">
              <Button size="icon" variant="ghost" onClick={() => setDark(!dark)}>
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0 overflow-hidden">
            <ChatWindow conversationId={selectedId} initialMessages={initialMessages} onConversationCreated={refresh} />
          </TabsContent>
          <TabsContent value="dashboard" className="flex-1 m-0 overflow-auto">
            <Dashboard />
          </TabsContent>
          <TabsContent value="logs" className="flex-1 m-0 overflow-auto">
            <LogsTable />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
