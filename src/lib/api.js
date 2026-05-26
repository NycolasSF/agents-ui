// streamChat — conecta ao endpoint SSE.
// onDelta(text)             — trecho de texto do assistant (emitido em tempo real)
// onToolUse({name,input,toolUseId})  — agent invocou uma tool
// onToolResult({toolUseId}) — resultado de uma tool chegou
// onDone(usage)             — resposta finalizada (usage pode ser null se abort)
// onError(msg)              — erro
// signal — AbortSignal para cancelar o stream
export async function streamChat({
  agentId, messages, imageBase64, imageMimeType,
  onDelta, onToolUse, onToolResult, onDone, onError, signal,
}) {
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, messages, imageBase64, imageMimeType }),
      signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      onError(err.error || 'Erro ao conectar com o servidor')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // guarda linha incompleta

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'delta') {
            await animateText(event.text, onDelta, signal)
            if (signal?.aborted) {
              onDone(null)
              return
            }
          } else if (event.type === 'tool_use') {
            onToolUse?.({ name: event.name, input: event.input, toolUseId: event.toolUseId })
          } else if (event.type === 'tool_result') {
            onToolResult?.({ toolUseId: event.toolUseId })
          } else if (event.type === 'done') {
            onDone(event.usage)
          } else if (event.type === 'error') {
            onError(event.message)
          }
        } catch { /* JSON inválido, ignora */ }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone(null)
      return
    }
    onError(err.message || 'Falha na conexão com o servidor')
  }
}

// Anima texto. Para respostas curtas, revela quase imediatamente; para respostas
// longas, limita ao máximo ~8k chars/s para não congelar o render de markdown.
function animateText(text, onDelta, signal) {
  return new Promise((resolve) => {
    // Respostas curtas (< 400 chars) revelam instantaneamente
    if (text.length < 400) {
      onDelta(text)
      resolve()
      return
    }
    const CHUNK = 40  // era 6
    let i = 0
    const tick = () => {
      if (signal?.aborted || i >= text.length) {
        resolve()
        return
      }
      onDelta(text.slice(i, Math.min(i + CHUNK, text.length)))
      i += CHUNK
      setTimeout(tick, 5)  // era 8
    }
    tick()
  })
}

export async function fetchAgents() {
  const res = await fetch('/api/agents')
  if (!res.ok) throw new Error('Falha ao carregar agentes')
  return res.json()
}

export async function fetchRegistry() {
  const res = await fetch('/api/registry')
  if (!res.ok) throw new Error('Falha ao carregar registry')
  return res.json()
}

export async function fetchDashboard() {
  const res = await fetch('/api/dashboard')
  if (!res.ok) throw new Error('Falha ao carregar dashboard')
  return res.json()
}

export async function uploadFile(name, mimeType, base64) {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType, base64 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Falha ao processar arquivo')
  }
  return res.json()
}

export async function fetchUrl(url) {
  const res = await fetch(`/api/webfetch?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Falha ao buscar URL')
  }
  return res.json()
}
