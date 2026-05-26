// Gera grafo do minimap do chat: nó central = chat, filhos = mensagens,
// mencionados = agents/pipelines detectados no texto.
//
// Decisões:
// - O chat fica SEMPRE no centro; mensagens e menções orbitam em torno.
// - Cada mensagem vira um mini-nó (sem label); menções viram nós maiores com label.
// - Detecção por regex simples (nome curto + id). Patterns curtos demais (<4 chars)
//   são descartados para evitar falsos positivos ("cto", "ia", etc.).

const REGISTRY_TO_UI = {
  'vendedor-especialista': 'vendedor',
  'analise-concorrentes': 'concorrentes',
  'lancamento-pago': 'lancamento',
  'alex-hormozi': 'hormozi',
  'clone-agent': 'clones',
  'orquestrar': 'orquestrador',
  'marcio-medeiros': 'marcio-medeiros',
  'nycolas': 'nycolas',
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Normaliza texto para busca (lowercase + remove acentos + colapsa espaços)
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

function shortName(name) {
  if (!name) return ''
  return name.split(/\s+[—→-]\s+/)[0].trim()
}

// Constrói a lista de entidades do ecossistema com os patterns a procurar.
export function buildEntityIndex({ allAgents, registry }) {
  const entities = []
  const uiIds = new Set((allAgents || []).map(a => a.id))

  // Agents da UI (com cor própria)
  for (const a of (allAgents || [])) {
    entities.push({
      nodeId: `agent-ui:${a.id}`,
      kind: 'agent-ui',
      label: shortName(a.name),
      color: a.color || '#a78bfa',
      size: 7,
      patterns: [shortName(a.name), a.id].filter(p => p && p.length >= 4),
    })
  }

  // Agents do registry que NÃO estão na UI
  for (const reg of (registry?.agents || [])) {
    const mapsToUi = REGISTRY_TO_UI[reg.id]
    if ((mapsToUi && uiIds.has(mapsToUi)) || uiIds.has(reg.id)) continue
    const isService = reg.type === 'service'
    entities.push({
      nodeId: isService ? `service:${reg.id}` : `agent-reg:${reg.id}`,
      kind: isService ? 'service' : 'agent-registry',
      label: shortName(reg.name).slice(0, 22),
      color: isService ? '#00E676' : '#55556a',
      size: 6,
      patterns: [shortName(reg.name), reg.id.replace(/-/g, ' ')].filter(p => p && p.length >= 4),
    })
  }

  // Pipelines
  for (const p of (registry?.pipelines || [])) {
    entities.push({
      nodeId: `pipeline:${p.id}`,
      kind: 'pipeline',
      label: shortName(p.name).slice(0, 22),
      color: '#7c3aed',
      size: 7,
      patterns: [shortName(p.name), p.id.replace(/-/g, ' ')].filter(p => p && p.length >= 4),
    })
  }

  return entities
}

export function extractMentions(text, entityIndex) {
  if (!text || !entityIndex?.length) return []
  const normText = norm(text)
  const found = []
  const seen = new Set()
  for (const e of entityIndex) {
    if (seen.has(e.nodeId)) continue
    for (const p of e.patterns) {
      const np = norm(p)
      if (np.length < 4) continue
      const re = new RegExp(`\\b${escapeRegex(np)}\\b`)
      if (re.test(normText)) {
        seen.add(e.nodeId)
        found.push(e)
        break
      }
    }
  }
  return found
}

export function buildChatMinimapData({ chatId, messages, agent, allAgents, registry }) {
  const nodes = []
  const links = []

  if (!chatId) return { nodes, links }

  // Nó central do chat
  const chatNodeId = `chat:${chatId}`
  nodes.push({
    id: chatNodeId,
    kind: 'chat-center',
    label: agent?.name ? shortName(agent.name) : 'Chat',
    color: agent?.color || '#a78bfa',
    size: 11,
    meta: { agentId: agent?.id },
  })

  // Nós de mensagem (pequenos, sem label)
  const msgs = messages || []
  msgs.forEach((msg, i) => {
    if (msg.id === 'welcome') return
    const isUser = msg.role === 'user'
    nodes.push({
      id: `msg:${chatId}:${i}`,
      kind: isUser ? 'message-user' : 'message-assistant',
      label: '',
      color: isUser ? '#c8c8d8' : (agent?.color || '#a78bfa'),
      size: 3,
      meta: { role: msg.role, idx: i },
    })
    links.push({
      source: chatNodeId,
      target: `msg:${chatId}:${i}`,
      kind: 'message',
      strength: 0.3,
    })
  })

  // Menções detectadas no texto combinado (foco no assistant, mas user também conta)
  const entityIndex = buildEntityIndex({ allAgents, registry })
  const combinedText = msgs.map(m => m.content || '').join('\n')
  const mentioned = extractMentions(combinedText, entityIndex)
  for (const m of mentioned) {
    nodes.push({
      id: m.nodeId,
      kind: m.kind,
      label: m.label,
      color: m.color,
      size: m.size,
      meta: {},
    })
    links.push({
      source: chatNodeId,
      target: m.nodeId,
      kind: 'mention',
      strength: 0.6,
    })
  }

  return { nodes, links }
}
