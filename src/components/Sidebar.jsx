import { useState, useEffect } from 'react'
import { Loader2, BarChart2, ChevronRight, Plus, Trash2, MessageSquare } from 'lucide-react'

export default function Sidebar({
  agents, activeAgent, activeChatId, chats, agentChats,
  onSelectAgent, onSelectChat, onDeleteChat,
  loading, view, onDashboard,
}) {
  const [expandedAgents, setExpandedAgents] = useState(new Set())

  // Auto-expande o agente ativo
  useEffect(() => {
    if (activeAgent) {
      setExpandedAgents(prev => new Set([...prev, activeAgent.id]))
    }
  }, [activeAgent?.id])

  const toggleExpand = (agentId, e) => {
    e.stopPropagation()
    setExpandedAgents(prev => {
      const next = new Set(prev)
      next.has(agentId) ? next.delete(agentId) : next.add(agentId)
      return next
    })
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-[#1e1e2e] bg-[#0a0a0f]">
      <div className="p-4 border-b border-[#1e1e2e]">
        <h1 className="text-sm font-semibold text-[#e8e8f0] tracking-wide uppercase">Agentes</h1>
        <p className="text-xs text-[#55556a] mt-0.5">Márcio Medeiros Educação</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[#55556a]" />
          </div>
        ) : (
          <ul className="space-y-0.5">
            {agents.map(agent => {
              const isActive = activeAgent?.id === agent.id && view === 'chat'
              const isNewChat = isActive && !activeChatId
              const isExpanded = expandedAgents.has(agent.id)
              const chatIds = agentChats[agent.id] || []
              const agentChatList = chatIds.map(id => chats[id]).filter(Boolean)

              return (
                <li key={agent.id}>
                  {/* Linha do agente */}
                  <div
                    className={`flex items-center rounded-lg transition-colors ${
                      isNewChat ? 'bg-[#1a1a25] border border-[#2a2a3e]' : 'border border-transparent'
                    }`}
                  >
                    <button
                      onClick={() => onSelectAgent(agent)}
                      className="flex-1 flex items-center gap-2.5 px-2 py-2.5 min-w-0 text-left"
                    >
                      <span
                        className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
                        style={{ backgroundColor: agent.color + '22', border: `1px solid ${agent.color}44` }}
                      >
                        {agent.icon}
                      </span>
                      <span className={`text-sm truncate ${isActive ? 'text-[#e8e8f0] font-medium' : 'text-[#8888a0]'}`}>
                        {agent.name}
                      </span>
                    </button>

                    <button
                      onClick={(e) => toggleExpand(agent.id, e)}
                      className="p-1.5 mr-1 rounded text-[#55556a] hover:text-[#8888a0] transition-colors"
                      title={isExpanded ? 'Recolher' : 'Expandir'}
                    >
                      <ChevronRight
                        size={13}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Lista de chats do agente */}
                  {isExpanded && (
                    <ul className="ml-3.5 pl-2.5 border-l border-[#1e1e2e] mt-0.5 mb-1 space-y-0.5">
                      {/* Nova conversa */}
                      <li>
                        <button
                          onClick={() => onSelectAgent(agent)}
                          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
                            isNewChat
                              ? 'text-[#a78bfa] bg-[#1a1a25]'
                              : 'text-[#55556a] hover:text-[#8888a0] hover:bg-[#12121a]'
                          }`}
                        >
                          <Plus size={11} />
                          Nova conversa
                        </button>
                      </li>

                      {/* Chats existentes */}
                      {agentChatList.map(chat => {
                        const isActiveChat = chat.id === activeChatId
                        return (
                          <li key={chat.id} className="group flex items-center gap-0.5">
                            <button
                              onClick={() => onSelectChat(chat.id)}
                              className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs min-w-0 transition-colors ${
                                isActiveChat
                                  ? 'bg-[#1a1a25] text-[#e8e8f0]'
                                  : 'text-[#8888a0] hover:text-[#c8c8d8] hover:bg-[#12121a]'
                              }`}
                            >
                              <MessageSquare size={11} className="shrink-0 opacity-50" />
                              <span className="truncate">{chat.title}</span>
                            </button>
                            <button
                              onClick={() => onDeleteChat(chat.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#55556a] hover:text-red-400 transition-all shrink-0"
                              title="Excluir chat"
                            >
                              <Trash2 size={10} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="p-2 border-t border-[#1e1e2e]">
        <button
          onClick={onDashboard}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm
            ${view === 'dashboard'
              ? 'bg-[#1a1a25] text-[#e8e8f0] border border-[#2a2a3e]'
              : 'text-[#55556a] hover:text-[#8888a0] hover:bg-[#12121a] border border-transparent'
            }
          `}
        >
          <BarChart2 size={16} />
          Dashboard de uso
        </button>
      </div>
    </aside>
  )
}
