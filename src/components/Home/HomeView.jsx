import { useMemo, useState } from 'react'
import { Network } from 'lucide-react'
import { buildGraphData } from '../../lib/graphData.js'
import GraphBackground from './GraphBackground.jsx'
import GraphFullscreen from './GraphFullscreen.jsx'
import HeroGreeting from './HeroGreeting.jsx'
import HeroInput from './HeroInput.jsx'
import QuickActions from './QuickActions.jsx'
import ErrorBoundary from '../ErrorBoundary.jsx'

export default function HomeView({
  agents, chats, agentChats, registry,
  onSelectAgent, onSelectChat, onHeroSend,
}) {
  const [showFullscreen, setShowFullscreen] = useState(false)

  // Chave estável: só recomputa quando a LISTA de chats muda (não a cada chunk
  // durante streaming). Sem isso, uma resposta do Claude sendo streamada
  // reaquece a simulação do grafo de fundo dezenas de vezes por segundo.
  const graphKey = useMemo(() => {
    const chatIds = Object.keys(chats || {}).sort().join(',')
    const agentIds = (agents || []).map(a => a.id).join(',')
    const regVer = registry?.updated_at || ''
    return `${agentIds}|${chatIds}|${regVer}`
  }, [agents, chats, registry])

  const graphData = useMemo(() => {
    try {
      return buildGraphData({ agents, chats, agentChats, registry })
    } catch (err) {
      console.error('[HomeView] buildGraphData falhou:', err)
      return { nodes: [], links: [] }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  const hasGraph = graphData.nodes.length > 0

  return (
    <div className="relative flex-1 overflow-hidden bg-[#0a0a0f]">
      {/* Grafo de fundo isolado: se crashar, Hero continua intacto */}
      {hasGraph && (
        <ErrorBoundary fallback={null}>
          <GraphBackground data={graphData} />
        </ErrorBoundary>
      )}

      <main role="main" className="relative z-10 flex flex-col items-center justify-center h-full gap-8 px-8">
        <HeroGreeting name="Nycolas" />
        <HeroInput agents={agents} onSend={onHeroSend} />
        <QuickActions agents={agents} onSelectAgent={onSelectAgent} />
      </main>

      {hasGraph && (
        <button
          onClick={() => setShowFullscreen(true)}
          className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-2 rounded-full
                     bg-[#12121a] border border-[#1e1e2e] text-[#8888a0] hover:text-[#e8e8f0]
                     hover:border-[#2a2a3e] transition-all text-xs font-mono"
        >
          <Network size={13} />
          Ver grafo completo
        </button>
      )}

      {hasGraph && (
        <div className="absolute bottom-6 left-6 z-20 text-[10px] text-[#55556a] font-mono">
          {graphData.nodes.length} nós · {graphData.links.length} conexões
        </div>
      )}

      {showFullscreen && (
        <ErrorBoundary fallback={null}>
          <GraphFullscreen
            data={graphData}
            agents={agents}
            onSelectAgent={onSelectAgent}
            onSelectChat={onSelectChat}
            onClose={() => setShowFullscreen(false)}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
