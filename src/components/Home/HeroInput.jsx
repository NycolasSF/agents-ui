import { useEffect, useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'

export default function HeroInput({ agents, onSend, disabled = false }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const defaultAgentId = useMemo(() => {
    if (!agents || agents.length === 0) return null
    const orq = agents.find(a => a.id === 'orquestrador')
    return orq?.id || agents[0].id
  }, [agents])

  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId)

  useEffect(() => {
    if (!selectedAgentId && defaultAgentId) setSelectedAgentId(defaultAgentId)
  }, [defaultAgentId, selectedAgentId])

  const selectedAgent = agents?.find(a => a.id === selectedAgentId)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  useEffect(autoResize, [text])

  const handleSend = () => {
    const value = text.trim()
    if (!value || !selectedAgentId || disabled) return
    onSend(selectedAgentId, value)
    setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = !!text.trim() && !!selectedAgentId && !disabled

  return (
    <div className="w-full max-w-2xl">
      <div className="relative bg-[#12121a]/90 backdrop-blur-sm border border-[#1e1e2e]
                      rounded-2xl focus-within:border-[#2a2a3e] transition-colors shadow-xl shadow-black/30">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Como posso ajudar você hoje?"
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent px-5 pt-4 pb-2 text-[#e8e8f0] placeholder-[#55556a]
                     resize-none outline-none text-base leading-relaxed
                     disabled:opacity-50"
          style={{ minHeight: '56px', maxHeight: '200px' }}
        />

        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          <button
            disabled
            title="Anexar (em breve)"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#55556a]
                       hover:bg-[#1a1a25] transition-colors disabled:cursor-default"
          >
            <span className="text-lg leading-none">+</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-[#8888a0]">
              <span className="text-[#55556a]">Agente:</span>
              <select
                value={selectedAgentId || ''}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="bg-transparent text-[#c8c8d8] border-none outline-none cursor-pointer
                           appearance-none pr-1"
                style={{ backgroundImage: 'none' }}
              >
                {(agents || []).map(a => (
                  <option key={a.id} value={a.id} className="bg-[#12121a] text-[#e8e8f0]">
                    {a.icon ? `${a.icon} ` : ''}{a.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSend}
              disabled={!canSend}
              className="p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: canSend ? (selectedAgent?.color || '#7c3aed') : '#1e1e2e',
                color: canSend ? '#fff' : '#55556a',
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-[#55556a] mt-3 font-mono">
        Enter envia · Shift+Enter quebra linha
      </p>
    </div>
  )
}
