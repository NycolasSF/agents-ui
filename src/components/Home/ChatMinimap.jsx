import { useMemo } from 'react'
import { Activity, Minus } from 'lucide-react'
import { buildChatActivityData, summarizeTools } from '../../lib/chatActivityData.js'
import GraphCanvas from './GraphCanvas.jsx'

const MINIMAP_KINDS_WITH_LABEL = ['chat-center', 'tool']

export default function ChatMinimap({
  chatId, messages, agent,
  collapsed, onToggleCollapsed,
}) {
  const effectiveChatId = chatId || (agent ? `pending:${agent.id}` : null)

  // Chave estável: ignora conteúdo de texto em streaming; só muda quando
  // uma tool nova é invocada ou mensagem termina.
  const dataKey = useMemo(() => {
    const msgs = messages || []
    let toolCount = 0
    for (const m of msgs) toolCount += (m.toolUses?.length || 0)
    const last = msgs[msgs.length - 1]
    const streaming = last?.streaming === true
    const stableMsgCount = streaming ? msgs.length - 1 : msgs.length
    return `${effectiveChatId}:${stableMsgCount}:${toolCount}`
  }, [effectiveChatId, messages])

  const graphData = useMemo(() => {
    try {
      return buildChatActivityData({
        chatId: effectiveChatId,
        messages: chatId ? messages : [],
        agent,
      })
    } catch (err) {
      console.error('[ChatMinimap] falha ao montar grafo:', err)
      return { nodes: [], links: [] }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, effectiveChatId, agent])

  if (!effectiveChatId) return null

  const toolSummary = summarizeTools(chatId ? messages : [])
  const toolCount = Array.from(toolSummary.values()).reduce((a, b) => a + b, 0)

  if (collapsed) {
    return (
      <button
        onClick={() => onToggleCollapsed?.(false)}
        className="absolute bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2
                   rounded-full bg-[#12121a]/90 border border-[#1e1e2e] backdrop-blur-sm
                   text-[#8888a0] hover:text-[#e8e8f0] hover:border-[#2a2a3e]
                   transition-all text-xs font-mono shadow-lg shadow-black/40"
        title="Expandir atividade do Claude"
      >
        <Activity size={13} />
        <span>{toolCount > 0 ? `${toolCount} ações` : 'Atividade'}</span>
      </button>
    )
  }

  return (
    <div
      className="absolute bottom-4 right-4 z-30 w-[300px] h-[230px]
                 bg-[#0a0a0f]/92 border border-[#1e1e2e] backdrop-blur-md
                 rounded-xl overflow-hidden shadow-xl shadow-black/50 flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity size={12} className="text-[#8888a0] shrink-0" />
          <span className="text-[11px] font-mono text-[#c8c8d8] uppercase tracking-wide">Atividade</span>
          <span className="text-[10px] font-mono text-[#55556a] truncate">
            · {toolCount} açã{toolCount === 1 ? 'o' : 'ões'}
          </span>
        </div>
        <button
          onClick={() => onToggleCollapsed?.(true)}
          className="p-1 rounded text-[#55556a] hover:text-[#8888a0] transition-colors shrink-0"
          title="Minimizar"
        >
          <Minus size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <GraphCanvas
          data={graphData}
          interactive={true}
          alwaysLabelKinds={MINIMAP_KINDS_WITH_LABEL}
          showParticles={true}
        />
        {graphData.nodes.length <= 1 && (
          <div className="absolute inset-0 flex items-end justify-center pointer-events-none pb-4">
            <p className="text-[10px] text-[#55556a] font-mono text-center px-4">
              As ações do Claude Code<br />aparecerão aqui
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
