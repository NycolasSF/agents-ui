import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import Dashboard from './components/Dashboard.jsx'
import PreviewPanel from './components/PreviewPanel.jsx'
import HomeView from './components/Home/HomeView.jsx'
import { fetchAgents, fetchRegistry } from './lib/api.js'

const CHATS_KEY = 'agents-ui-chats'
const AGENT_CHATS_KEY = 'agents-ui-agent-chats'

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback }
  catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export default function App() {
  const [agents, setAgents] = useState([])
  const [registry, setRegistry] = useState(null)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [serverError, setServerError] = useState(false)
  const [view, setView] = useState('home')

  // { [chatId]: { id, agentId, title, createdAt, messages[] } }
  const [chats, setChats] = useState(() => load(CHATS_KEY, {}))
  // { [agentId]: chatId[] } — mais recente primeiro
  const [agentChats, setAgentChats] = useState(() => load(AGENT_CHATS_KEY, {}))

  const [activeChatId, setActiveChatId] = useState(null)
  const [activeAgent, setActiveAgent] = useState(null)
  const [pendingInitialText, setPendingInitialText] = useState(null)

  const [previewArtifact, setPreviewArtifact] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [artifactHistory, setArtifactHistory] = useState([])

  useEffect(() => {
    Promise.all([
      fetchAgents(),
      fetchRegistry().catch(() => null),
    ])
      .then(([list, reg]) => {
        setAgents(list)
        if (list.length > 0) setActiveAgent(list[0])
        setRegistry(reg)
        setLoadingAgents(false)
      })
      .catch(() => { setServerError(true); setLoadingAgents(false) })
  }, [])

  useEffect(() => { save(CHATS_KEY, chats) }, [chats])
  useEffect(() => { save(AGENT_CHATS_KEY, agentChats) }, [agentChats])

  // Cria novo chat ao enviar primeira mensagem; retorna o chatId criado
  const createChat = useCallback((agentId, firstMsgText) => {
    const id = `chat_${Date.now()}`
    const title = firstMsgText.slice(0, 60).trim() || 'Nova conversa'
    setChats(prev => ({ ...prev, [id]: { id, agentId, title, createdAt: new Date().toISOString(), messages: [] } }))
    setAgentChats(prev => ({ ...prev, [agentId]: [id, ...(prev[agentId] || [])] }))
    setActiveChatId(id)
    return id
  }, [])

  // Atualiza mensagens de um chat específico por id (evita closure stale)
  const setMessagesByChatId = useCallback((chatId, updater) => {
    setChats(prev => {
      const chat = prev[chatId]
      if (!chat) return prev
      return {
        ...prev,
        [chatId]: {
          ...chat,
          messages: typeof updater === 'function' ? updater(chat.messages) : updater,
        },
      }
    })
  }, [])

  const deleteChat = useCallback((chatId) => {
    setChats(prev => { const n = { ...prev }; delete n[chatId]; return n })
    setAgentChats(prev => {
      const agentId = chats[chatId]?.agentId
      if (!agentId) return prev
      return { ...prev, [agentId]: (prev[agentId] || []).filter(id => id !== chatId) }
    })
    if (activeChatId === chatId) setActiveChatId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, chats])

  const clearPreview = () => {
    setPreviewArtifact(null)
    setShowPreview(false)
    setArtifactHistory([])
  }

  const handleArtifactDetected = (artifact) => {
    setPreviewArtifact(artifact)
    setShowPreview(true)
    setArtifactHistory(prev => {
      const exists = prev.some(a => a.startIndex === artifact.startIndex && a.type === artifact.type)
      return exists ? prev : [...prev, artifact]
    })
  }

  const selectChat = (chatId) => {
    const chat = chats[chatId]
    if (!chat) return
    const agent = agents.find(a => a.id === chat.agentId)
    if (agent) setActiveAgent(agent)
    setActiveChatId(chatId)
    setView('chat')
    clearPreview()
  }

  const selectAgent = (agent) => {
    setActiveAgent(agent)
    setActiveChatId(null) // inicia modo "nova conversa"
    setView('chat')
    clearPreview()
  }

  const heroSend = useCallback((agentId, text) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent || !text?.trim()) return
    setActiveAgent(agent)
    setActiveChatId(null)
    setPendingInitialText(text.trim())
    setView('chat')
    clearPreview()
  }, [agents])

  const messages = activeChatId ? (chats[activeChatId]?.messages || []) : []

  if (serverError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-[#e8e8f0] font-semibold mb-2">Servidor não encontrado</h2>
          <p className="text-[#8888a0] text-sm mb-4">O servidor de agentes não está rodando. Inicie-o com:</p>
          <code className="block bg-[#12121a] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm text-[#a78bfa] font-mono text-left">
            cd agents-ui<br />npm run dev:all
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar
        agents={agents}
        activeAgent={activeAgent}
        activeChatId={activeChatId}
        chats={chats}
        agentChats={agentChats}
        onSelectAgent={selectAgent}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        loading={loadingAgents}
        view={view}
        onHome={() => setView('home')}
        onDashboard={() => setView('dashboard')}
      />
      {view === 'home' ? (
        <HomeView
          agents={agents}
          chats={chats}
          agentChats={agentChats}
          registry={registry}
          onSelectAgent={selectAgent}
          onSelectChat={selectChat}
          onHeroSend={heroSend}
        />
      ) : view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <div className="flex-1 flex overflow-hidden min-w-0">
          {/* Chat — ocupa 100% ou 50% dependendo do preview */}
          <div className={`flex min-w-0 ${showPreview ? 'w-1/2 shrink-0' : 'flex-1'}`}>
            <ChatWindow
              agent={activeAgent}
              messages={messages}
              activeChatId={activeChatId}
              createChat={createChat}
              setMessagesByChatId={setMessagesByChatId}
              onDeleteCurrentChat={() => activeChatId && deleteChat(activeChatId)}
              onArtifactDetected={handleArtifactDetected}
              initialText={pendingInitialText}
              onInitialConsumed={() => setPendingInitialText(null)}
              allAgents={agents}
              registry={registry}
            />
          </div>

          {/* Preview — aparece quando há artifact previewable */}
          {showPreview && (
            <div className="w-1/2 shrink-0 hidden md:block">
              <PreviewPanel
                artifact={previewArtifact}
                artifactHistory={artifactHistory}
                onClose={() => setShowPreview(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
