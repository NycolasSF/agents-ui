import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Trash2, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { streamChat } from '../lib/api.js'

export default function ChatWindow({ agent }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  // Scroll para o fim quando novas mensagens chegam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Foca no textarea quando troca de agente
  useEffect(() => {
    textareaRef.current?.focus()
    // Mensagem de boas-vindas ao selecionar agente
    if (agent && messages.length === 0) {
      const welcomes = {
        vendedor: `Olá! Sou o **Nycolas**, consultor especialista em redução de INSS de obras.\n\nCom quem tenho o prazer de falar? 😊`,
        lancamento: `Olá! Vamos trabalhar no seu lançamento. Com qual etapa do **Método W** você quer começar?\n\n- Promessa e posicionamento\n- Página de captura\n- Criativos\n- Cronograma de conteúdo\n- Pitch e oferta`,
        concorrentes: `Pronto para analisar a concorrência. Informe o nome ou URL do concorrente que deseja analisar.`,
        hormozi: `Me fala um número primeiro.\n\nQual é o seu faturamento atual? Sem esse dado, qualquer conselho é cego.`,
        livre: `Olá! Como posso ajudar?`,
      }
      const text = welcomes[agent.id]
      if (text) {
        setMessages([{ role: 'assistant', content: text, id: Date.now() }])
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming) return

    setError(null)
    setInput('')

    const userMsg = { role: 'user', content: text, id: Date.now() }
    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true }

    const updatedMessages = [...messages, userMsg]
    setMessages([...updatedMessages, assistantMsg])
    setStreaming(true)

    // Monta o histórico sem mensagens de boas-vindas artificiais
    // (remove a primeira mensagem se foi gerada automaticamente pelo frontend)
    const historyToSend = updatedMessages.filter(m => m.role === 'user' || !m.autoWelcome)

    let accumulatedText = ''

    await streamChat({
      agentId: agent.id,
      messages: historyToSend.map(m => ({ role: m.role, content: m.content })),
      onDelta: (chunk) => {
        accumulatedText += chunk
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: accumulatedText } : m
        ))
      },
      onDone: () => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m
        ))
        setStreaming(false)
      },
      onError: (msg) => {
        setError(msg)
        setMessages(prev => prev.filter(m => m.id !== assistantMsg.id))
        setStreaming(false)
      },
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
    textareaRef.current?.focus()
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">👈</div>
          <p className="text-[#55556a] text-sm">Selecione um agente na barra lateral</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header do chat */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ backgroundColor: agent.color + '22', border: `1px solid ${agent.color}44` }}
          >
            {agent.icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#e8e8f0]">{agent.name}</h2>
            <p className="text-xs text-[#55556a]">{agent.description}</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Limpar conversa"
            className="p-2 rounded-lg text-[#55556a] hover:text-[#8888a0] hover:bg-[#1a1a25] transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <Message key={msg.id} message={msg} agentColor={agent.color} />
        ))}

        {error && (
          <div className="mx-auto max-w-xl bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>Erro:</strong> {error}
            <p className="text-xs mt-1 text-red-400/70">Verifique se o servidor está rodando e a API key está configurada.</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-3 focus-within:border-[#2a2a3e] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Mensagem para ${agent.name}...`}
              disabled={streaming}
              rows={1}
              className="flex-1 bg-transparent text-[#e8e8f0] placeholder-[#55556a] text-sm resize-none outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-50"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="p-2 rounded-lg transition-all duration-150 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: input.trim() && !streaming ? agent.color : '#1e1e2e',
                color: input.trim() && !streaming ? '#fff' : '#55556a',
              }}
            >
              {streaming ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          <p className="text-center text-xs text-[#55556a] mt-2">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      </div>
    </div>
  )
}

function Message({ message, agentColor }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const copyText = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-xl bg-[#1a1a25] border border-[#2a2a3e] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-[#e8e8f0] leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start animate-fade-up group">
      <div className="max-w-3xl w-full">
        {/* Indicador do agente */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: agentColor }}
          />
          <span className="text-xs text-[#55556a]">Assistente</span>
        </div>

        <div className="relative">
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-[#c8c8d8] prose-chat">
            {message.content ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              <span className="inline-block w-2 h-4 bg-[#55556a] animate-blink" />
            )}

            {message.streaming && message.content && (
              <span className="inline-block w-2 h-4 bg-[#7c3aed] animate-blink ml-0.5 align-bottom" />
            )}
          </div>

          {/* Botão de copiar */}
          {!message.streaming && message.content && (
            <button
              onClick={copyText}
              className="absolute top-3 right-3 p-1.5 rounded-md text-[#55556a] hover:text-[#8888a0] hover:bg-[#1e1e2e] opacity-0 group-hover:opacity-100 transition-all"
              title="Copiar"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
