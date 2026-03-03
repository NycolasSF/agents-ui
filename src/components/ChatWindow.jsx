import { useRef, useState } from 'react'
import { Send, Loader2, Trash2, Copy, Check, ImagePlus, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { streamChat } from '../lib/api.js'

const WELCOMES = {
  vendedor: `Olá! Sou o **Nycolas**, consultor especialista em redução de INSS de obras.\n\nCom quem tenho o prazer de falar? 😊`,
  lancamento: `Olá! Vamos trabalhar no seu lançamento. Com qual etapa do **Método W** você quer começar?\n\n- Promessa e posicionamento\n- Página de captura\n- Criativos\n- Cronograma de conteúdo\n- Pitch e oferta`,
  concorrentes: `Pronto para analisar a concorrência. Informe o nome ou URL do concorrente que deseja analisar.`,
  hormozi: `Me fala um número primeiro.\n\nQual é o seu faturamento atual? Sem esse dado, qualquer conselho é cego.`,
  livre: `Olá! Como posso ajudar?`,
}

export default function ChatWindow({ agent, messages, activeChatId, createChat, setMessagesByChatId, onDeleteCurrentChat }) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [pendingImage, setPendingImage] = useState(null) // { base64, mimeType, preview }
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  // Mensagens exibidas: chat real se existe, senão welcome local
  const displayMessages = activeChatId
    ? messages
    : (agent && WELCOMES[agent.id]
      ? [{ role: 'assistant', content: WELCOMES[agent.id], id: 'welcome' }]
      : [])

  // Scroll para o fim sempre que displayMessages muda
  const prevLen = useRef(0)
  if (displayMessages.length !== prevLen.current) {
    prevLen.current = displayMessages.length
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setPendingImage({ base64: dataUrl.split(',')[1], mimeType: file.type, preview: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e) => {
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        handleImageFile(item.getAsFile())
        return
      }
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if ((!text && !pendingImage) || streaming) return

    setError(null)
    setInput('')
    const imageData = pendingImage
    setPendingImage(null)

    // Criar chat se ainda não existe (primeira mensagem)
    let chatId = activeChatId
    if (!chatId) {
      chatId = createChat(agent.id, text || '(imagem)')
    }

    const userMsg = {
      role: 'user',
      content: text || '',
      imagePreview: imageData?.preview || null,
      id: Date.now(),
    }
    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true }

    // Histórico para enviar à API (mensagens reais + nova mensagem)
    const historyForApi = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    setMessagesByChatId(chatId, prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    let accumulatedText = ''

    await streamChat({
      agentId: agent.id,
      messages: historyForApi,
      imageBase64: imageData?.base64,
      imageMimeType: imageData?.mimeType,
      onDelta: (chunk) => {
        accumulatedText += chunk
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: accumulatedText } : m
        ))
      },
      onDone: (usage) => {
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, streaming: false, usage } : m
        ))
        setStreaming(false)
      },
      onError: (msg) => {
        setError(msg)
        setMessagesByChatId(chatId, prev => prev.filter(m => m.id !== assistantMsg.id))
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
      {/* Header */}
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

        {activeChatId && (
          <button
            onClick={onDeleteCurrentChat}
            title="Excluir conversa"
            className="p-2 rounded-lg text-[#55556a] hover:text-red-400 hover:bg-[#1a1a25] transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {displayMessages.map(msg => (
          <Message key={msg.id} message={msg} agentColor={agent.color} />
        ))}

        {error && (
          <div className="mx-auto max-w-xl bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-300">
            <strong>Erro:</strong> {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Thumbnail imagem pendente */}
          {pendingImage && (
            <div className="mb-2">
              <div className="relative inline-block">
                <img
                  src={pendingImage.preview}
                  alt="Imagem para enviar"
                  className="h-16 w-16 object-cover rounded-lg border border-[#2a2a3e]"
                />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#1e1e2e] border border-[#2a2a3e] rounded-full flex items-center justify-center text-[#8888a0] hover:text-[#e8e8f0]"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-3 focus-within:border-[#2a2a3e] transition-colors">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Anexar imagem (ou Ctrl+V)"
              className="p-1.5 rounded-lg text-[#55556a] hover:text-[#8888a0] hover:bg-[#1e1e2e] transition-colors shrink-0 disabled:opacity-40"
            >
              <ImagePlus size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { handleImageFile(e.target.files[0]); e.target.value = '' }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`Mensagem para ${agent.name}...`}
              disabled={streaming}
              rows={1}
              className="flex-1 bg-transparent text-[#e8e8f0] placeholder-[#55556a] text-sm resize-none outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-50"
              style={{ minHeight: '24px' }}
            />

            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !pendingImage) || streaming}
              className="p-2 rounded-lg transition-all duration-150 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: (input.trim() || pendingImage) && !streaming ? agent.color : '#1e1e2e',
                color: (input.trim() || pendingImage) && !streaming ? '#fff' : '#55556a',
              }}
            >
              {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>

          <p className="text-center text-xs text-[#55556a] mt-2">
            Enter para enviar · Shift+Enter para nova linha · Ctrl+V para colar imagem
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
        <div className="max-w-xl space-y-2">
          {message.imagePreview && (
            <div className="flex justify-end">
              <img
                src={message.imagePreview}
                alt="Imagem enviada"
                className="max-h-48 max-w-xs rounded-xl border border-[#2a2a3e] object-contain"
              />
            </div>
          )}
          {message.content && (
            <div className="bg-[#1a1a25] border border-[#2a2a3e] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-[#e8e8f0] leading-relaxed">
              {message.content}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start animate-fade-up group">
      <div className="max-w-3xl w-full">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agentColor }} />
          <span className="text-xs text-[#55556a]">Assistente</span>
          {message.usage && !message.streaming && (
            <span className="text-xs text-[#55556a] bg-[#12121a] border border-[#1e1e2e] rounded px-1.5 py-0.5 ml-1">
              {(message.usage.inputTokens || 0) + (message.usage.outputTokens || 0)} tok
              {message.usage.costUSD > 0 && ` · $${message.usage.costUSD.toFixed(4)}`}
            </span>
          )}
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
