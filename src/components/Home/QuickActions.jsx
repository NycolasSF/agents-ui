import { Palette, Rocket, PenLine, MessageCircle, Search } from 'lucide-react'

const ACTIONS = [
  { label: 'Criar criativo',       agentId: 'nycolas',      icon: Palette },
  { label: 'Planejar lançamento',  agentId: 'lancamento',   icon: Rocket },
  { label: 'Corrigir texto',       agentId: 'orquestrador', icon: PenLine },
  { label: 'Falar com Nycolas',    agentId: 'nycolas',      icon: MessageCircle },
  { label: 'Analisar concorrente', agentId: 'concorrentes', icon: Search },
]

export default function QuickActions({ agents, onSelectAgent }) {
  const byId = new Map((agents || []).map(a => [a.id, a]))

  const handle = (agentId) => {
    const a = byId.get(agentId)
    if (a) onSelectAgent(a)
  }

  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
      {ACTIONS.map(({ label, agentId, icon: Icon }) => {
        const agent = byId.get(agentId)
        if (!agent) return null
        return (
          <button
            key={label}
            onClick={() => handle(agentId)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl
                       bg-[#12121a]/80 backdrop-blur-sm border border-[#1e1e2e]
                       text-xs text-[#8888a0]
                       hover:text-[#e8e8f0] hover:border-[#2a2a3e] hover:bg-[#1a1a25]
                       transition-all"
          >
            <Icon size={13} className="shrink-0" style={{ color: agent.color || '#a78bfa' }} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
