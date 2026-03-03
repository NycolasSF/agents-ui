import { MessageSquare, Loader2 } from 'lucide-react'

export default function Sidebar({ agents, activeId, onSelect, loading }) {
  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-[#1e1e2e] bg-[#0a0a0f]">
      {/* Header */}
      <div className="p-4 border-b border-[#1e1e2e]">
        <h1 className="text-sm font-semibold text-[#e8e8f0] tracking-wide uppercase">
          Agentes
        </h1>
        <p className="text-xs text-[#55556a] mt-0.5">Márcio Medeiros Educação</p>
      </div>

      {/* Lista de agentes */}
      <nav className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[#55556a]" />
          </div>
        ) : (
          <ul className="space-y-1">
            {agents.map(agent => (
              <AgentItem
                key={agent.id}
                agent={agent}
                active={agent.id === activeId}
                onClick={() => onSelect(agent)}
              />
            ))}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#1e1e2e]">
        <p className="text-xs text-[#55556a] text-center">
          claude-sonnet-4-6
        </p>
      </div>
    </aside>
  )
}

function AgentItem({ agent, active, onClick }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`
          w-full text-left px-3 py-3 rounded-lg transition-all duration-150
          flex items-start gap-3 group
          ${active
            ? 'bg-[#1a1a25] border border-[#2a2a3e]'
            : 'hover:bg-[#12121a] border border-transparent'
          }
        `}
      >
        {/* Ícone com cor do agente */}
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 mt-0.5"
          style={{ backgroundColor: agent.color + '22', border: `1px solid ${agent.color}44` }}
        >
          {agent.icon}
        </span>

        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${active ? 'text-[#e8e8f0]' : 'text-[#8888a0] group-hover:text-[#e8e8f0]'}`}>
            {agent.name}
          </p>
          <p className="text-xs text-[#55556a] truncate mt-0.5 leading-tight">
            {agent.description}
          </p>
        </div>
      </button>
    </li>
  )
}
