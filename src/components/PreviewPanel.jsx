import { useState, useEffect } from 'react'
import { X, Copy, Check, Code2, Eye, History } from 'lucide-react'

function buildSrcDoc(artifact) {
  if (!artifact) return ''
  const { type, content } = artifact

  if (type === 'svg') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff}</style></head><body>${content}</body></html>`
  }

  if (content.includes('<!DOCTYPE') || content.includes('<html')) {
    return content
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`
}

const TABS = [
  { id: 'preview', label: 'Preview',   Icon: Eye     },
  { id: 'code',    label: 'Código',    Icon: Code2   },
  { id: 'history', label: 'Histórico', Icon: History },
]

export default function PreviewPanel({ artifact, artifactHistory, onClose }) {
  const [tab, setTab] = useState('preview')
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState(artifact)

  // Atualiza artifact selecionado e muda para aba Preview automaticamente
  useEffect(() => {
    if (artifact) {
      setSelected(artifact)
      setTab('preview')
    }
  }, [artifact])

  const copyCode = () => {
    navigator.clipboard.writeText(selected?.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full border-l border-[#1e1e2e] bg-[#0a0a0f]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#e8e8f0]">Preview</span>
          {selected && (
            <span className="text-xs bg-[#1e1e2e] border border-[#2a2a3e] text-[#a78bfa] px-2 py-0.5 rounded">
              {selected.label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          title="Fechar preview"
          className="p-1.5 rounded-lg text-[#55556a] hover:text-[#e8e8f0] hover:bg-[#1e1e2e] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e2e] shrink-0 px-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? 'text-[#e8e8f0] border-[#7c3aed]'
                : 'text-[#55556a] border-transparent hover:text-[#8888a0]'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-hidden relative">

        {/* Preview */}
        {tab === 'preview' && (
          selected?.previewable ? (
            <iframe
              key={selected.startIndex}
              srcDoc={buildSrcDoc(selected)}
              sandbox="allow-scripts allow-modals"
              title="Preview"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <div className="flex items-center justify-center h-full px-6">
              <p className="text-[#55556a] text-sm text-center">
                {selected
                  ? `Preview não disponível para ${selected.label}`
                  : 'Nenhum artifact selecionado'}
              </p>
            </div>
          )
        )}

        {/* Código */}
        {tab === 'code' && (
          selected ? (
            <div className="relative h-full">
              <button
                onClick={copyCode}
                className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#12121a] border border-[#1e1e2e] text-[#8888a0] hover:text-[#e8e8f0] hover:border-[#2a2a3e] rounded-md transition-colors"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <pre className="h-full overflow-auto p-4 pt-12 text-xs text-[#c8c8d8] leading-relaxed font-mono whitespace-pre-wrap break-words">
                <code>{selected.content}</code>
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[#55556a] text-sm">Nenhum artifact selecionado</p>
            </div>
          )
        )}

        {/* Histórico */}
        {tab === 'history' && (
          <div className="overflow-y-auto h-full p-3 space-y-2">
            {artifactHistory.length === 0 ? (
              <p className="text-xs text-[#55556a] text-center py-8">
                Nenhum artifact nesta conversa
              </p>
            ) : (
              artifactHistory.map((a, i) => {
                const isSelected = selected?.startIndex === a.startIndex && selected?.type === a.type
                return (
                  <button
                    key={i}
                    onClick={() => { setSelected(a); setTab('preview') }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-[#1a1a25] border-[#2a2a3e] text-[#e8e8f0]'
                        : 'bg-[#12121a] border-[#1e1e2e] text-[#8888a0] hover:border-[#2a2a3e] hover:text-[#c8c8d8]'
                    }`}
                  >
                    <div className="text-xs font-medium mb-0.5">{a.label}</div>
                    <div className="text-[#55556a] text-xs truncate">
                      {a.content.slice(0, 80).trim()}{a.content.length > 80 ? '...' : ''}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}

      </div>
    </div>
  )
}
