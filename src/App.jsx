import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import { fetchAgents } from './lib/api.js'

export default function App() {
  const [agents, setAgents] = useState([])
  const [activeAgent, setActiveAgent] = useState(null)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [serverError, setServerError] = useState(false)

  useEffect(() => {
    fetchAgents()
      .then(list => {
        setAgents(list)
        if (list.length > 0) setActiveAgent(list[0])
        setLoadingAgents(false)
      })
      .catch(() => {
        setServerError(true)
        setLoadingAgents(false)
      })
  }, [])

  if (serverError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-[#e8e8f0] font-semibold mb-2">Servidor não encontrado</h2>
          <p className="text-[#8888a0] text-sm mb-4">
            O servidor de agentes não está rodando. Inicie-o com:
          </p>
          <code className="block bg-[#12121a] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm text-[#a78bfa] font-mono text-left">
            cd agents-ui<br />
            npm run dev:all
          </code>
          <p className="text-[#55556a] text-xs mt-4">
            Certifique-se de que o arquivo <code className="text-[#7c3aed]">.env</code> existe com a chave <code className="text-[#7c3aed]">ANTHROPIC_API_KEY</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar
        agents={agents}
        activeId={activeAgent?.id}
        onSelect={setActiveAgent}
        loading={loadingAgents}
      />
      <ChatWindow agent={activeAgent} />
    </div>
  )
}
