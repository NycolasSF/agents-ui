// streamChat — envia mensagem e anima resposta caractere por caractere
// onDelta(text) — trecho animado
// onDone(usage) — quando animação termina; usage pode ser null
// onError(msg) — em caso de erro
export async function streamChat({ agentId, messages, imageBase64, imageMimeType, onDelta, onDone, onError }) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, messages, imageBase64, imageMimeType }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }))
      onError(err.error || 'Erro ao conectar com o servidor')
      return
    }

    const data = await response.json()

    if (data.error) {
      onError(data.error)
      return
    }

    const text = data.text || ''
    const usage = data.usage || null

    // Animação de digitação: envia em blocos de 6 chars para parecer streaming
    const CHUNK = 6
    let i = 0
    const tick = () => {
      if (i >= text.length) {
        onDone(usage)
        return
      }
      const end = Math.min(i + CHUNK, text.length)
      onDelta(text.slice(i, end))
      i = end
      setTimeout(tick, 8)
    }
    tick()

  } catch (err) {
    onError(err.message || 'Falha na conexão com o servidor')
  }
}

export async function fetchAgents() {
  const res = await fetch('/api/agents')
  if (!res.ok) throw new Error('Falha ao carregar agentes')
  return res.json()
}

export async function fetchDashboard() {
  const res = await fetch('/api/dashboard')
  if (!res.ok) throw new Error('Falha ao carregar dashboard')
  return res.json()
}
