// Gera o grafo de ATIVIDADE do chat: nó central = chat/agent, sub-nós = cada
// ferramenta/sub-agente invocado pelo Claude Code durante a conversa.
//
// A fonte dos dados é `messages[i].toolUses` — um array gravado pelo ChatWindow
// em tempo real conforme os eventos `tool_use` chegam via SSE do backend.

const TOOL_STYLE = {
  // Web / busca
  'WebSearch':    { color: '#FCAF45', label: 'Web Search' },
  'WebFetch':     { color: '#FCAF45', label: 'Fetch URL' },
  // Filesystem
  'Read':         { color: '#8888a0', label: 'Read' },
  'Write':        { color: '#8888a0', label: 'Write' },
  'Edit':         { color: '#8888a0', label: 'Edit' },
  'Glob':         { color: '#55556a', label: 'Glob' },
  'Grep':         { color: '#55556a', label: 'Grep' },
  'NotebookEdit': { color: '#8888a0', label: 'Notebook' },
  // Shell
  'Bash':         { color: '#00E676', label: 'Bash' },
  'BashOutput':   { color: '#00E676', label: 'Bash out' },
  'KillShell':    { color: '#00E676', label: 'Kill shell' },
  // Sub-agents / planning
  'Agent':        { color: '#7c3aed', label: 'Sub-agent' },
  'Task':         { color: '#7c3aed', label: 'Task' },
  'TaskCreate':   { color: '#a78bfa', label: 'Task create' },
  'TaskUpdate':   { color: '#a78bfa', label: 'Task update' },
  'ExitPlanMode': { color: '#a78bfa', label: 'Plan' },
  'TodoWrite':    { color: '#a78bfa', label: 'Todos' },
  // Skill / MCP
  'Skill':        { color: '#ec4899', label: 'Skill' },
  'ToolSearch':   { color: '#ec4899', label: 'Tool search' },
  // User interaction
  'AskUserQuestion': { color: '#0ea5e9', label: 'Ask user' },
}

function getToolInfo(name, input) {
  const style = TOOL_STYLE[name] || { color: '#55556a', label: name || 'Tool' }
  let label = style.label
  // Sub-agent tem subagent_type no input — mostra quem foi chamado
  if ((name === 'Agent' || name === 'Task') && input?.subagent_type) {
    label = `${input.subagent_type}`
  }
  return { color: style.color, label }
}

export function buildChatActivityData({ chatId, messages, agent }) {
  const nodes = []
  const links = []
  if (!chatId) return { nodes, links }

  const chatNodeId = `chat:${chatId}`
  nodes.push({
    id: chatNodeId,
    kind: 'chat-center',
    label: agent?.name?.split(/\s+[—-]\s+/)[0].trim() || 'Chat',
    color: agent?.color || '#a78bfa',
    size: 11,
    meta: { agentId: agent?.id, type: 'chat' },
  })

  let idx = 0
  const msgs = messages || []
  for (const msg of msgs) {
    if (!Array.isArray(msg.toolUses) || msg.toolUses.length === 0) continue
    for (const tu of msg.toolUses) {
      const info = getToolInfo(tu.name, tu.input)
      const toolNodeId = `tool:${chatId}:${idx++}`
      nodes.push({
        id: toolNodeId,
        kind: 'tool',
        label: info.label.slice(0, 20),
        color: info.color,
        size: 5,
        meta: {
          type: 'tool_use',
          name: tu.name,
          input: tu.input,
          toolUseId: tu.toolUseId,
          ts: tu.ts,
          completed: tu.completed === true,
        },
      })
      links.push({
        source: chatNodeId,
        target: toolNodeId,
        kind: 'tool-use',
        strength: 0.6,
      })
    }
  }

  return { nodes, links }
}

// Contagem agregada por tipo — útil para o header do widget
export function summarizeTools(messages) {
  const counts = new Map()
  for (const msg of (messages || [])) {
    for (const tu of (msg.toolUses || [])) {
      counts.set(tu.name, (counts.get(tu.name) || 0) + 1)
    }
  }
  return counts
}
