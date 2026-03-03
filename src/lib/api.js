// Envia mensagem e anima a resposta caractere por caractere
// onChunk(text) — chamado com cada trecho animado
// onDone() — chamado quando a animação termina
// onError(msg) — chamado em caso de erro
export async function streamChat({ agentId, messages, onDelta, onDone, onError }) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, messages }),
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

    // Animação de digitação: envia em blocos de 4-8 chars para parecer streaming
    const CHUNK = 6
    let i = 0
    const tick = () => {
      if (i >= text.length) {
        onDone()
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
