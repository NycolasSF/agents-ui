import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide } from 'd3-force'

const LINK_STYLES = {
  'chat-owner':    { color: '#8888a0', alphaBg: 0.22, alphaFs: 0.55, width: 1,   dash: [] },
  'orchestrates':  { color: '#a78bfa', alphaBg: 0.32, alphaFs: 0.80, width: 1.8, dash: [] },
  'context-dep':   { color: '#FCAF45', alphaBg: 0.25, alphaFs: 0.70, width: 1.2, dash: [4, 4] },
  'pipeline-step': { color: '#7c3aed', alphaBg: 0.32, alphaFs: 0.78, width: 2.2, dash: [] },
  'reference':     { color: '#55556a', alphaBg: 0.15, alphaFs: 0.38, width: 1,   dash: [2, 6] },
  // Minimap do chat:
  'message':       { color: '#55556a', alphaBg: 0.40, alphaFs: 0.45, width: 0.8, dash: [] },
  'mention':       { color: '#a78bfa', alphaBg: 0.55, alphaFs: 0.75, width: 1.6, dash: [] },
  'tool-use':      { color: '#a78bfa', alphaBg: 0.55, alphaFs: 0.75, width: 1.4, dash: [] },
}

const ALWAYS_LABEL_DEFAULT = ['agent-ui', 'pipeline']

function hexA(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return hex + a
}

export default function GraphCanvas({
  data,
  interactive = true,
  width, height,
  onNodeClick, onNodeHover,
  highlightNodes = null, highlightLinks = null,
  onEngineStop,
  alwaysLabelKinds = ALWAYS_LABEL_DEFAULT,
  showParticles = false,
}) {
  const alwaysLabelSet = useMemo(() => new Set(alwaysLabelKinds), [alwaysLabelKinds])
  const graphRef = useRef(null)
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: width ?? 800, h: height ?? 600 })

  useEffect(() => {
    if (width != null && height != null) {
      setDims({ w: width, h: height })
      return
    }
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect
      if (w > 0 && h > 0) setDims({ w, h })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [width, height])

  const degreeMap = useMemo(() => {
    const m = new Map()
    for (const l of data?.links || []) {
      const src = typeof l.source === 'object' ? l.source.id : l.source
      const tgt = typeof l.target === 'object' ? l.target.id : l.target
      m.set(src, (m.get(src) || 0) + 1)
      m.set(tgt, (m.get(tgt) || 0) + 1)
    }
    return m
  }, [data?.links])

  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return

    const charge = fg.d3Force('charge')
    if (charge) charge.strength(-80)

    const link = fg.d3Force('link')
    if (link) {
      link.distance(l => l.kind === 'pipeline-step' ? 40 : l.kind === 'chat-owner' ? 30 : 50)
      link.strength(l => l.kind === 'pipeline-step' ? 0.8 : l.kind === 'orchestrates' ? 0.5 : 0.3)
    }

    const center = fg.d3Force('center')
    if (center) center.strength(0.03)

    fg.d3Force('collide', forceCollide(n => n.size + 4))
    fg.d3ReheatSimulation()
  }, [data])

  const drawNode = (node, ctx, globalScale) => {
    const isHl = highlightNodes?.has(node.id)
    const isDim = highlightNodes && !isHl
    const r = node.size
    const x = node.x, y = node.y
    const color = node.color

    if (isDim) ctx.globalAlpha = 0.08

    const degree = degreeMap.get(node.id) || 0
    const haloR = r + 4 + Math.min(degree * 1.0, 10)
    const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, haloR)
    grad.addColorStop(0, hexA(color, 0.38))
    grad.addColorStop(1, hexA(color, 0))
    ctx.beginPath()
    ctx.arc(x, y, haloR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle = hexA(color, 0.66)
    ctx.lineWidth = 0.8
    ctx.stroke()

    // Labels: kinds em alwaysLabelSet sempre visíveis no modo interativo;
    // demais só em zoom próximo ou hover. Nunca no background (grafo de fundo).
    const alwaysLabel = interactive && alwaysLabelSet.has(node.kind)
    if (alwaysLabel || globalScale > 1.6 || isHl) {
      const fontSize = Math.max(9, 11 / globalScale)
      ctx.font = `${fontSize}px "DM Sans", system-ui, sans-serif`
      ctx.fillStyle = hexA('#e8e8f0', isHl ? 0.95 : 0.78)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label, x, y + r + 3 / globalScale)
    }

    if (isDim) ctx.globalAlpha = 1
  }

  const drawLink = (link, ctx) => {
    const style = LINK_STYLES[link.kind] || LINK_STYLES['reference']
    const isHl = highlightLinks?.has(link)
    const isDim = highlightLinks && !isHl
    const alpha = interactive
      ? (isHl ? Math.min(1, style.alphaFs * 1.8) : style.alphaFs)
      : style.alphaBg

    if (isDim) ctx.globalAlpha = 0.08

    ctx.beginPath()
    if (style.dash.length) ctx.setLineDash(style.dash)
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = hexA(style.color, alpha)
    ctx.lineWidth = style.width
    ctx.stroke()
    if (style.dash.length) ctx.setLineDash([])

    if (isDim) ctx.globalAlpha = 1
  }

  const handleEngineStop = () => {
    if (!interactive) graphRef.current?.pauseAnimation()
    onEngineStop?.()
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={data}
        width={dims.w}
        height={dims.h}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={150}
        warmupTicks={50}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={drawLink}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onEngineStop={handleEngineStop}
        enableNodeDrag={interactive}
        enableZoomInteraction={interactive}
        enablePanInteraction={interactive}
        enablePointerInteraction={interactive}
        linkDirectionalParticles={showParticles ? (l) => (l.kind === 'mention' || l.kind === 'message' ? 2 : 0) : 0}
        linkDirectionalParticleSpeed={0.008}
        linkDirectionalParticleWidth={1.6}
        linkDirectionalParticleColor={(l) => LINK_STYLES[l.kind]?.color || '#a78bfa'}
        minZoom={0.3}
        maxZoom={6}
      />
    </div>
  )
}
