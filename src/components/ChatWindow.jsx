import { useRef, useState, useEffect } from 'react'
import { Send, Square, Trash2, Copy, Check, ImagePlus, X, Link, Loader2, FileText, Activity } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { streamChat, fetchUrl, uploadFile } from '../lib/api.js'
import { getPreviewableArtifacts, hasOpenCodeBlock } from '../lib/artifactParser.js'
import ChatMinimap from './Home/ChatMinimap.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

const WELCOMES = {
  vendedor: `Olá! Sou o **Nycolas**, consultor especialista em redução de INSS de obras.\n\nCom quem tenho o prazer de falar? 😊`,
  lancamento: `Olá! Vamos trabalhar no seu lançamento. Com qual etapa do **Método W** você quer começar?\n\n- Promessa e posicionamento\n- Página de captura\n- Criativos\n- Cronograma de conteúdo\n- Pitch e oferta`,
  concorrentes: `Pronto para analisar a concorrência. Informe o nome ou URL do concorrente que deseja analisar.`,
  hormozi: `Me fala um número primeiro.\n\nQual é o seu faturamento atual? Sem esse dado, qualquer conselho é cego.`,
  livre: `Olá! Como posso ajudar?`,
  'marcio-medeiros': `Olá! Sou o **Márcio Medeiros**, contador e especialista em INSS de obra.\n\nFui criado na obra antes de me tornar contador — então sei exatamente o que construtores, incorporadores e contadores enfrentam na prática.\n\nSobre o que você quer tirar dúvidas hoje?\n\n- Fator de ajuste (PF ou PJ)\n- Aferição de obra (GPS espontânea ou por aferição)\n- CNO, eSocial, SERO, GFIP, MatObra\n- Regularização de obras\n- Contabilidade imobiliária e holding\n- Reforma tributária (IBS, CBS, redutor de ajuste)`,
  nycolas: `E aí! Sou o **Nycolas**, estrategista de lançamentos da Escola Márcio Medeiros Educação.\n\nPor onde vamos começar?\n\n- **Copy e mensagens** — WhatsApp, carrossel, legenda\n- **Lançamento** — Método W, cronograma, lotes, simulação\n- **Criativos** — conceito, roteiro, ângulo de dor\n- **Página de venda ou captura** — estrutura, copy, CTA\n- **Webinário** — roteiro completo do evento\n- **Análise de concorrentes** — Stefane, mercado`,
}

export default function ChatWindow({ agent, messages, activeChatId, createChat, setMessagesByChatId, onDeleteCurrentChat, onArtifactDetected, initialText, onInitialConsumed, allAgents, registry }) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [pendingImage, setPendingImage] = useState(null) // { base64, mimeType, preview }
  const [pendingUrl, setPendingUrl] = useState(null) // { url, content }
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [urlError, setUrlError] = useState(null)
  const [pendingFiles, setPendingFiles] = useState([]) // [{ name, content, size }]
  const [uploadingFile, setUploadingFile] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const docInputRef = useRef(null)
  const urlInputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const initialSentRef = useRef(false)

  const MINIMAP_KEY = 'agents-ui-minimap-collapsed'
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => {
    try { return localStorage.getItem(MINIMAP_KEY) === '1' } catch { return false }
  })
  const handleToggleMinimap = (v) => {
    const next = typeof v === 'boolean' ? v : !minimapCollapsed
    setMinimapCollapsed(next)
    try { localStorage.setItem(MINIMAP_KEY, next ? '1' : '0') } catch {}
  }

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

  const handleFetchUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setFetchingUrl(true)
    setUrlError(null)
    try {
      const data = await fetchUrl(url)
      setPendingUrl({ url: data.url, content: data.content })
      setUrlInput('')
      setShowUrlInput(false)
      textareaRef.current?.focus()
    } catch (err) {
      setUrlError(err.message)
    } finally {
      setFetchingUrl(false)
    }
  }

  const TEXT_EXTS = /\.(txt|md|markdown|json|csv|js|jsx|ts|tsx|py|java|c|cpp|cs|go|rb|php|html|css|xml|yaml|yml|sh|bash|sql|log|env|toml|ini|conf|gitignore)$/i

  const handleFileUpload = async (files) => {
    if (!files?.length) return
    setUploadingFile(true)
    const added = []
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`"${file.name}" é muito grande (máx 5 MB)`)
        continue
      }
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        let content
        if (file.type === 'application/pdf') {
          const data = await uploadFile(file.name, file.type, base64)
          content = data.content
        } else if (file.type.startsWith('text/') || TEXT_EXTS.test(file.name)) {
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
          content = new TextDecoder('utf-8').decode(bytes)
        } else {
          alert(`Tipo de arquivo não suportado: ${file.name}`)
          continue
        }

        added.push({ name: file.name, content, size: file.size })
      } catch (err) {
        alert(`Erro ao processar "${file.name}": ${err.message}`)
      }
    }
    if (added.length) setPendingFiles(prev => [...prev, ...added])
    setUploadingFile(false)
    if (docInputRef.current) docInputRef.current.value = ''
  }

  const sendMessage = async (overrideText) => {
    const hasOverride = typeof overrideText === 'string'
    const text = (hasOverride ? overrideText : input).trim()
    if ((!text && !pendingImage && !pendingUrl && !pendingFiles.length) || streaming) return

    setError(null)
    if (!hasOverride) setInput('')
    const imageData = pendingImage
    setPendingImage(null)
    const urlData = pendingUrl
    setPendingUrl(null)
    const filesData = pendingFiles
    setPendingFiles([])

    // Criar chat se ainda não existe (primeira mensagem)
    let chatId = activeChatId
    if (!chatId) {
      chatId = createChat(agent.id, text || filesData[0]?.name || '(imagem)')
    }

    // Monta conteúdo completo com contextos anexados
    let fullContent = text || ''
    if (urlData) {
      const urlBlock = `[Conteúdo de ${urlData.url}]\n\n${urlData.content}`
      fullContent = fullContent ? `${fullContent}\n\n---\n${urlBlock}` : urlBlock
    }
    for (const f of filesData) {
      const fileBlock = `[Arquivo: ${f.name}]\n\n${f.content}`
      fullContent = fullContent ? `${fullContent}\n\n---\n${fileBlock}` : fileBlock
    }

    const userMsg = {
      role: 'user',
      content: fullContent,
      imagePreview: imageData?.preview || null,
      urlAttachment: urlData ? urlData.url : null,
      fileAttachments: filesData.length ? filesData.map(f => ({ name: f.name, size: f.size })) : null,
      id: Date.now(),
    }
    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true }

    // Histórico para enviar à API (mensagens reais + nova mensagem)
    const historyForApi = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    setMessagesByChatId(chatId, prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    abortControllerRef.current = new AbortController()
    let accumulatedText = ''
    let lastPreviewableCount = 0

    const notifyArtifacts = (text) => {
      if (hasOpenCodeBlock(text)) return
      const artifacts = getPreviewableArtifacts(text)
      if (artifacts.length > lastPreviewableCount) {
        lastPreviewableCount = artifacts.length
        onArtifactDetected?.(artifacts[artifacts.length - 1])
      }
    }

    await streamChat({
      agentId: agent.id,
      messages: historyForApi,
      imageBase64: imageData?.base64,
      imageMimeType: imageData?.mimeType,
      signal: abortControllerRef.current.signal,
      onDelta: (chunk) => {
        accumulatedText += chunk
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: accumulatedText } : m
        ))
        notifyArtifacts(accumulatedText)
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      },
      onToolUse: (evt) => {
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, toolUses: [...(m.toolUses || []), { ...evt, ts: Date.now(), completed: false }] }
            : m
        ))
      },
      onToolResult: (evt) => {
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id
            ? {
                ...m,
                toolUses: (m.toolUses || []).map(tu =>
                  tu.toolUseId === evt.toolUseId ? { ...tu, completed: true } : tu
                ),
              }
            : m
        ))
      },
      onDone: (usage) => {
        setMessagesByChatId(chatId, prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, streaming: false, usage } : m
        ))
        setStreaming(false)
        abortControllerRef.current = null
        notifyArtifacts(accumulatedText)
      },
      onError: (msg) => {
        setError(msg)
        setMessagesByChatId(chatId, prev => prev.filter(m => m.id !== assistantMsg.id))
        setStreaming(false)
        abortControllerRef.current = null
      },
    })
  }

  const stopStreaming = () => {
    abortControllerRef.current?.abort()
  }

  // Auto-envio quando HomeView passa initialText via props
  useEffect(() => {
    if (initialText && !initialSentRef.current && agent && !streaming) {
      initialSentRef.current = true
      sendMessage(initialText)
      onInitialConsumed?.()
    } else if (!initialText && initialSentRef.current) {
      initialSentRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, agent])

  // Cleanup: aborta stream em andamento ao desmontar (ex: usuário volta pra Home
  // durante streaming). Sem isso, o fetch continua chamando setMessagesByChatId
  // e re-renderiza o App em loop.
  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleDragEnter = (e) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragging(false)
  }

  const handleDragOver = (e) => { e.preventDefault() }

  const handleDrop = (e) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)
    const files = e.dataTransfer.files
    if (!files?.length) return
    // Imagens vão para pendingImage (só a primeira), resto para handleFileUpload
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const docs = Array.from(files).filter(f => !f.type.startsWith('image/'))
    if (imgs.length) handleImageFile(imgs[0])
    if (docs.length) handleFileUpload(docs)
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
    <div
      className="flex-1 flex flex-col min-w-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Widget de atividade do Claude Code — isolado em ErrorBoundary */}
      <ErrorBoundary fallback={null}>
        <ChatMinimap
          chatId={activeChatId}
          messages={messages}
          agent={agent}
          collapsed={minimapCollapsed}
          onToggleCollapsed={handleToggleMinimap}
        />
      </ErrorBoundary>

      {/* Overlay de drag-and-drop */}
      {dragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d0d14]/80 border-2 border-dashed border-[#7c3aed] rounded-xl pointer-events-none">
          <FileText size={40} className="text-[#7c3aed] mb-3" />
          <p className="text-[#e8e8f0] text-lg font-semibold">Solte para anexar</p>
          <p className="text-[#55556a] text-sm mt-1">txt, pdf, csv, código, imagens…</p>
        </div>
      )}

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

        <div className="flex items-center gap-1">
          <button
            onClick={() => handleToggleMinimap()}
            title={minimapCollapsed ? 'Mostrar atividade do Claude' : 'Ocultar atividade do Claude'}
            className={`p-2 rounded-lg transition-colors ${
              minimapCollapsed
                ? 'text-[#55556a] hover:text-[#8888a0] hover:bg-[#1a1a25]'
                : 'text-[#a78bfa] bg-[#1a1a25]'
            }`}
          >
            <Activity size={15} />
          </button>
          {activeChatId && (
            <button
              onClick={onDeleteCurrentChat}
              title="Excluir conversa"
              className="p-2 rounded-lg text-[#55556a] hover:text-red-400 hover:bg-[#1a1a25] transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
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

          {/* Arquivos pendentes */}
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-[#1a1a25] border border-[#2a2a3e] rounded-lg px-2.5 py-1.5 text-xs text-[#8888a0]">
                  <FileText size={12} className="shrink-0 text-emerald-400" />
                  <span className="text-emerald-300 max-w-[160px] truncate">{f.name}</span>
                  <span className="text-[#55556a]">{(f.size / 1024).toFixed(0)}KB</span>
                  <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-400 transition-colors">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* URL pendente */}
          {pendingUrl && (
            <div className="mb-2 flex items-center gap-2 bg-[#1a1a25] border border-[#2a2a3e] rounded-lg px-3 py-2 text-xs text-[#8888a0] max-w-full">
              <Link size={12} className="shrink-0 text-blue-400" />
              <span className="truncate text-blue-300">{pendingUrl.url}</span>
              <span className="shrink-0 text-[#55556a]">{(pendingUrl.content.length / 1000).toFixed(1)}k chars</span>
              <button onClick={() => setPendingUrl(null)} className="shrink-0 hover:text-red-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Input de URL */}
          {showUrlInput && (
            <div className="mb-2 flex items-center gap-2 bg-[#12121a] border border-[#2a2a3e] rounded-lg px-3 py-2">
              <Link size={14} className="text-blue-400 shrink-0" />
              <input
                ref={urlInputRef}
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleFetchUrl() }
                  if (e.key === 'Escape') { setShowUrlInput(false); setUrlInput(''); setUrlError(null) }
                }}
                placeholder="Cole a URL aqui..."
                className="flex-1 bg-transparent text-[#e8e8f0] text-sm outline-none placeholder-[#55556a]"
                autoFocus
              />
              {urlError && <span className="text-xs text-red-400 shrink-0">{urlError}</span>}
              {fetchingUrl ? (
                <Loader2 size={14} className="animate-spin text-blue-400 shrink-0" />
              ) : (
                <button
                  onClick={handleFetchUrl}
                  disabled={!urlInput.trim()}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 shrink-0"
                >
                  Buscar
                </button>
              )}
              <button
                onClick={() => { setShowUrlInput(false); setUrlInput(''); setUrlError(null) }}
                className="text-[#55556a] hover:text-[#8888a0] shrink-0"
              >
                <X size={14} />
              </button>
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

            <button
              onClick={() => { setShowUrlInput(v => !v); setUrlError(null) }}
              disabled={streaming}
              title="Buscar conteúdo de URL"
              className={`p-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-40 ${showUrlInput || pendingUrl ? 'text-blue-400 bg-blue-900/20' : 'text-[#55556a] hover:text-[#8888a0] hover:bg-[#1e1e2e]'}`}
            >
              <Link size={16} />
            </button>

            <button
              onClick={() => docInputRef.current?.click()}
              disabled={streaming || uploadingFile}
              title="Anexar arquivo (txt, md, pdf, json, csv, código…)"
              className={`p-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-40 ${pendingFiles.length ? 'text-emerald-400 bg-emerald-900/20' : 'text-[#55556a] hover:text-[#8888a0] hover:bg-[#1e1e2e]'}`}
            >
              {uploadingFile ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            </button>
            <input
              ref={docInputRef}
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv,.pdf,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rb,.php,.html,.css,.xml,.yaml,.yml,.sh,.sql,.log,.env,.toml,.ini,.conf"
              className="hidden"
              onChange={e => handleFileUpload(e.target.files)}
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

            {streaming ? (
              <button
                onClick={stopStreaming}
                title="Parar geração"
                className="p-2 rounded-lg transition-all duration-150 shrink-0 bg-red-900/40 border border-red-800/50 text-red-400 hover:bg-red-900/60"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim() && !pendingImage && !pendingUrl && !pendingFiles.length}
                className="p-2 rounded-lg transition-all duration-150 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: (input.trim() || pendingImage || pendingUrl || pendingFiles.length) ? agent.color : '#1e1e2e',
                  color: (input.trim() || pendingImage || pendingUrl || pendingFiles.length) ? '#fff' : '#55556a',
                }}
              >
                <Send size={16} />
              </button>
            )}
          </div>

          <p className="text-center text-xs text-[#55556a] mt-2">
            Enter para enviar · Shift+Enter para nova linha · Ctrl+V para imagem · 🔗 URL · 📄 arquivos (txt, pdf, csv, código…)
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
    // Extrai o texto visível removendo o bloco de URL se houver
    const hasAttachments = message.urlAttachment || message.fileAttachments?.length
    const displayContent = hasAttachments
      ? message.content
          .replace(/\n\n---\n\[(?:Conteúdo de|Arquivo:)[^\]]*\][\s\S]*$/, '')
          .replace(/^\[(?:Conteúdo de|Arquivo:)[^\]]*\][\s\S]*$/, '')
          .trim()
      : message.content

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
          {message.urlAttachment && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 bg-blue-900/20 border border-blue-800/30 rounded-lg px-2.5 py-1.5 text-xs text-blue-300">
                <Link size={11} />
                <span className="truncate max-w-xs">{message.urlAttachment}</span>
              </div>
            </div>
          )}
          {message.fileAttachments?.length > 0 && (
            <div className="flex justify-end flex-wrap gap-1.5">
              {message.fileAttachments.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-800/30 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300">
                  <FileText size={11} />
                  <span className="truncate max-w-[200px]">{f.name}</span>
                  <span className="text-emerald-600">{(f.size / 1024).toFixed(0)}KB</span>
                </div>
              ))}
            </div>
          )}
          {displayContent && (
            <div className="bg-[#1a1a25] border border-[#2a2a3e] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-[#e8e8f0] leading-relaxed">
              {displayContent}
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
