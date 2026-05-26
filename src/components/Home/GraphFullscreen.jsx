import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import GraphCanvas from './GraphCanvas.jsx'

const KIND_LABEL = {
  'agent-ui': 'Agente (ativo na UI)',
  'agent-registry': 'Agente (catálogo)',
  'chat': 'Conversa',
  'pipeline': 'Pipeline',
  'service': 'Serviço',
}

export default function GraphFullscreen({
  data, agents,
  onSelectAgent, onSelectChat,
  onClose,
}) {
  const [hoveredId, setHoveredId] = useState(null)
  const [highlightNodes, setHighlightNodes] = useState(null)
  const [highlightLinks, setHighlightLinks] = useState(null)
  const [sidePanelNode, setSidePanelNode] = useState(null)

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const linksByNode = useMemo(() => {
    const m = new Map()
    for (const l of data?.links || []) {
      const src = typeof l.source === 'object' ? l.source.id : l.source
      const tgt = typeof l.target === 'object' ? l.target.id : l.target
      if (!m.has(src)) m.set(src, [])
      if (!m.has(tgt)) m.set(tgt, [])
      m.get(src).push(l)
      m.get(tgt).push(l)
    }
    return m
  }, [data?.links])

  const handleHover = useCallback((node) => {
    if (!node) {
      setHoveredId(null)
      setHighlightNodes(null)
      setHighlightLinks(null)
      return
    }
    const neighbors = new Set([node.id])
    const hLinks = new Set()
    for (const l of linksByNode.get(node.id) || []) {
      hLinks.add(l)
      const srcId = typeof l.source === 'object' ? l.source.id : l.source
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target
      neighbors.add(srcId)
      neighbors.add(tgtId)
    }
    setHoveredId(node.id)
    setHighlightNodes(neighbors)
    setHighlightLinks(hLinks)
  }, [linksByNode])

  const handleClick = useCallback((node) => {
    if (!node) return
    if (node.kind === 'agent-ui') {
      const agent = (agents || []).find(a => a.id === node.meta?.id)
      if (agent) { onSelectAgent(agent); onClose() }
      return
    }
    if (node.kind === 'chat') {
      onSelectChat(node.meta?.id)
      onClose()
      return
    }
    setSidePanelNode(node)
  }, [agents, onSelectAgent, onSelectChat, onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg
                   bg-[#12121a] border border-[#1e1e2e] text-[#8888a0] hover:text-[#e8e8f0]
                   hover:border-[#2a2a3e] transition-all text-xs font-mono"
      >
        <X size={13} />
        Fechar (ESC)
      </button>

      <div className="absolute top-5 left-5 z-10 text-xs text-[#55556a] font-mono">
        <span className="text-[#8888a0]">{data?.nodes?.length || 0}</span> nós ·{' '}
        <span className="text-[#8888a0]">{data?.links?.length || 0}</span> conexões
      </div>

      <GraphCanvas
        data={data}
        interactive={true}
        onNodeHover={handleHover}
        onNodeClick={handleClick}
        highlightNodes={highlightNodes}
        highlightLinks={highlightLinks}
      />

      {sidePanelNode && (
        <aside
          className="absolute right-0 top-0 h-full w-80 bg-[#12121a] border-l border-[#1e1e2e]
                     overflow-y-auto p-5"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <div className="text-xs text-[#55556a] uppercase tracking-wide mb-1">
                {KIND_LABEL[sidePanelNode.kind] || sidePanelNode.kind}
              </div>
              <h3 className="text-base font-semibold text-[#e8e8f0] break-words">
                {sidePanelNode.label}
              </h3>
            </div>
            <button
              onClick={() => setSidePanelNode(null)}
              className="p-1.5 rounded text-[#55556a] hover:text-[#8888a0] shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(sidePanelNode.meta || {}).map(([k, v]) => {
              if (v == null || v === '') return null
              return (
                <div key={k}>
                  <div className="text-[10px] text-[#55556a] uppercase tracking-wide mb-0.5">{k}</div>
                  <div className="text-xs text-[#c8c8d8] font-mono break-all leading-relaxed">
                    {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2
                      rounded-full bg-[#12121a]/90 border border-[#1e1e2e] text-[10px] font-mono text-[#55556a]">
        <span className="flex items-center gap-1.5"><Dot c="#a78bfa" /> agentes UI</span>
        <span className="flex items-center gap-1.5"><Dot c="#55556a" /> catálogo</span>
        <span className="flex items-center gap-1.5"><Dot c="#7c3aed" /> pipeline</span>
        <span className="flex items-center gap-1.5"><Dot c="#00E676" /> serviço</span>
        <span className="flex items-center gap-1.5"><Dot c="#8888a0" /> chats</span>
      </div>
    </div>
  )
}

function Dot({ c }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: c }} />
}
