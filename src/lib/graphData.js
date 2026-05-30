// Mapeia id do registry → id do /api/agents (quando o agent existe nos dois)
// Os ids no registry são os "nomes canônicos" (ex: vendedor-especialista)
// e os na UI são curtos (ex: vendedor).
const REGISTRY_TO_UI = {
  'vendedor-especialista': 'vendedor',
  'analise-concorrentes': 'concorrentes',
  'lancamento-pago': 'lancamento',
  'alex-hormozi': 'hormozi',
  'clone-agent': 'clones',
  'orquestrar': 'orquestrador',
  'marcio-expert': 'marcio-expert',
  'nyc-agent': 'nyc-agent',
}

const COLORS = {
  'agent-ui': '#a78bfa',
  'agent-registry': '#55556a',
  'pipeline': '#7c3aed',
  'service': '#00E676',
  'chat': '#8888a0',
}

const SIZES = {
  'agent-ui': 10,
  'agent-registry': 6,
  'pipeline': 9,
  'service': 7,
  'chat': 4,
}

// Resolve um id do registry para o id do node correspondente (UI, registry ou service).
// Precisa do catálogo do registry para saber o type (service vs command/skill/agent).
function resolveNodeId(registryId, registryAgents, uiIds) {
  const mappedUi = REGISTRY_TO_UI[registryId]
  if (mappedUi && uiIds.has(mappedUi)) return `agent-ui:${mappedUi}`
  if (uiIds.has(registryId)) return `agent-ui:${registryId}`

  const regAgent = registryAgents.find(a => a.id === registryId)
  if (regAgent?.type === 'service') return `service:${registryId}`
  return `agent-reg:${registryId}`
}

export function buildGraphData({ agents, chats, agentChats, registry }) {
  const nodes = []
  const links = []
  const nodeSet = new Set()

  const addNode = (node) => {
    if (!nodeSet.has(node.id)) {
      nodeSet.add(node.id)
      nodes.push(node)
    }
  }

  const uiIds = new Set((agents || []).map(a => a.id))
  const regAgents = registry?.agents || []

  // 1. AGENTS DA UI (9 registrados em /api/agents) — com cor própria
  for (const agent of (agents || [])) {
    addNode({
      id: `agent-ui:${agent.id}`,
      kind: 'agent-ui',
      label: agent.name.split(/\s+[—-]\s+/)[0].trim(),
      color: agent.color || COLORS['agent-ui'],
      size: SIZES['agent-ui'],
      icon: agent.icon || '🤖',
      meta: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        color: agent.color,
        tools: agent.tools,
      },
    })
  }

  // 2. AGENTS DO REGISTRY que NÃO existem na UI → agent-registry ou service
  for (const reg of regAgents) {
    const mapsToUi = REGISTRY_TO_UI[reg.id]
    const isInUi = (mapsToUi && uiIds.has(mapsToUi)) || uiIds.has(reg.id)
    if (isInUi) continue

    const isService = reg.type === 'service'
    const kind = isService ? 'service' : 'agent-registry'
    const nodeId = isService ? `service:${reg.id}` : `agent-reg:${reg.id}`

    addNode({
      id: nodeId,
      kind,
      label: (reg.name || reg.id).split(/\s+[—-]\s+/)[0].trim().slice(0, 22),
      color: COLORS[kind],
      size: SIZES[kind],
      icon: isService ? '🔧' : '⚡',
      meta: {
        id: reg.id,
        name: reg.name,
        type: reg.type,
        capabilities: reg.capabilities,
        status: reg.status,
        path: reg.path,
      },
    })
  }

  // 3. ARESTAS vindas do registry (orchestrates, context_dependencies, references)
  for (const reg of regAgents) {
    const srcId = resolveNodeId(reg.id, regAgents, uiIds)

    if (reg.orchestrates) {
      for (const targetId of reg.orchestrates) {
        const tgtId = resolveNodeId(targetId, regAgents, uiIds)
        links.push({ source: srcId, target: tgtId, kind: 'orchestrates', strength: 0.5 })
      }
    }
    if (reg.context_dependencies) {
      for (const targetId of reg.context_dependencies) {
        const tgtId = resolveNodeId(targetId, regAgents, uiIds)
        links.push({ source: srcId, target: tgtId, kind: 'context-dep', strength: 0.3 })
      }
    }
    if (reg.references) {
      for (const targetId of reg.references) {
        const exists = regAgents.find(a => a.id === targetId) || uiIds.has(targetId)
        if (!exists) continue // references aponta para várias coisas (ex: "idv"); ignorar não-agents
        const tgtId = resolveNodeId(targetId, regAgents, uiIds)
        links.push({ source: srcId, target: tgtId, kind: 'reference', strength: 0.1 })
      }
    }
  }

  // 4. PIPELINES como super-nós
  for (const pipe of (registry?.pipelines || [])) {
    const pipeNodeId = `pipeline:${pipe.id}`
    addNode({
      id: pipeNodeId,
      kind: 'pipeline',
      label: pipe.name.split(/\s+[—→-]\s+/)[0].trim().slice(0, 22),
      color: COLORS['pipeline'],
      size: SIZES['pipeline'],
      icon: '🔗',
      meta: {
        id: pipe.id,
        name: pipe.name,
        steps: pipe.steps,
      },
    })
    pipe.steps.forEach((stepId, i) => {
      const stepNodeId = resolveNodeId(stepId, regAgents, uiIds)
      links.push({ source: pipeNodeId, target: stepNodeId, kind: 'pipeline-step', strength: 0.8 })
      if (i > 0) {
        const prevNodeId = resolveNodeId(pipe.steps[i - 1], regAgents, uiIds)
        links.push({ source: prevNodeId, target: stepNodeId, kind: 'pipeline-step', strength: 0.5 })
      }
    })
  }

  // 5. CHATS do localStorage (ligam ao agent dono)
  for (const [chatId, chat] of Object.entries(chats || {})) {
    if (!chat?.agentId || !uiIds.has(chat.agentId)) continue
    addNode({
      id: `chat:${chatId}`,
      kind: 'chat',
      label: (chat.title || 'Chat').slice(0, 24),
      color: COLORS['chat'],
      size: SIZES['chat'],
      icon: '💬',
      meta: {
        id: chatId,
        title: chat.title,
        agentId: chat.agentId,
        createdAt: chat.createdAt,
        msgCount: chat.messages?.length || 0,
      },
    })
    links.push({
      source: `agent-ui:${chat.agentId}`,
      target: `chat:${chatId}`,
      kind: 'chat-owner',
      strength: 0.2,
    })
  }

  // Sanitização: remove links cujos endpoints não existem como nodes
  const validIds = new Set(nodes.map(n => n.id))
  const safeLinks = links.filter(l => validIds.has(l.source) && validIds.has(l.target))

  return { nodes, links: safeLinks }
}
