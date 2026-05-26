import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { homedir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const SKILLS_PATH = process.env.SKILLS_PATH
  ? resolve(__dirname, '..', process.env.SKILLS_PATH)
  : resolve(ROOT, 'skills')

// Diretório de trabalho do spawn do CLI claude. Definindo como
// `marcio-medeiros-educacao`, o Claude Code carrega automaticamente o
// CLAUDE.md dali + herda skills globais de .claude/. Override via env AGENT_CWD.
const AGENT_CWD = process.env.AGENT_CWD
  ? resolve(process.env.AGENT_CWD)
  : resolve(ROOT, 'marcio-medeiros-educacao')

// Arquivo local de log de uso por request
const USAGE_LOG = resolve(__dirname, '../data/usage.json')
mkdirSync(resolve(__dirname, '../data'), { recursive: true })
if (!existsSync(USAGE_LOG)) writeFileSync(USAGE_LOG, JSON.stringify({ requests: [] }), 'utf-8')

const childEnv = { ...process.env }
delete childEnv.CLAUDECODE
delete childEnv.ANTHROPIC_API_KEY

const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' })) // permite imagens em base64

// ── Preços Anthropic por MTok (março 2025) ────────────────────────────────
const PRICING = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-opus-4-6':   { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-haiku-4-5':  { input: 0.80, output: 4, cacheWrite: 1.00, cacheRead: 0.08 },
}

function estimateCost(model, usage) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6']
  const inputM  = (usage.inputTokens || 0) / 1_000_000
  const outputM = (usage.outputTokens || 0) / 1_000_000
  const cacheWM = (usage.cacheCreationInputTokens || 0) / 1_000_000
  const cacheRM = (usage.cacheReadInputTokens || 0) / 1_000_000
  return +(inputM * p.input + outputM * p.output + cacheWM * p.cacheWrite + cacheRM * p.cacheRead).toFixed(6)
}

// ── Persistência de uso ───────────────────────────────────────────────────
function appendUsage(entry) {
  try {
    const data = JSON.parse(readFileSync(USAGE_LOG, 'utf-8'))
    data.requests.push(entry)
    // manter só os últimos 1000 requests para não crescer infinito
    if (data.requests.length > 1000) data.requests = data.requests.slice(-1000)
    writeFileSync(USAGE_LOG, JSON.stringify(data, null, 2), 'utf-8')
  } catch { /* ignora erros de I/O */ }
}

function readUsageLog() {
  try { return JSON.parse(readFileSync(USAGE_LOG, 'utf-8')) }
  catch { return { requests: [] } }
}

// ── Model Routing ─────────────────────────────────────────────────────────
// Roteamento semântico por complexidade — pesquisa: Haiku para simples, Opus para pipelines
const MODEL_ROUTING = {
  // Alta complexidade — raciocínio estratégico, pipelines, síntese
  high: 'claude-opus-4-6',
  // Média — agentes especializados com contexto rico
  medium: 'claude-sonnet-4-6',
  // Simples — tarefas diretas, sem pipeline
  simple: 'claude-haiku-4-5-20251001',
}

function detectComplexity(agentId, messageContent = '') {
  if (agentId === 'orquestrador') return 'high'
  if (agentId === 'clones') return 'high'
  if (agentId === 'lancamento') return 'high'
  const pipelineKeywords = /pipeline|estrategia|lançamento|com base em|e depois|baseado nos/i
  if (pipelineKeywords.test(messageContent)) return 'high'
  const mediumAgents = ['concorrentes', 'hormozi', 'clones']
  if (mediumAgents.includes(agentId)) return 'medium'
  return 'simple'
}

// ── Habilidades ───────────────────────────────────────────────────────────
function loadSkill(filename) {
  const filePath = resolve(SKILLS_PATH, filename)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf-8')
}

function buildAgentConfig(agentId) {
  const catalog = loadSkill('Esteira_Completa_Marcio_Medeiros_Educacao.md')

  const configs = {
    vendedor: {
      name: 'Vendedor Especialista',
      description: 'Consultor comercial com metodologia neurovendas',
      icon: '🎯',
      color: '#7c3aed',
      tools: [],
      systemPrompt: () => {
        const skill = loadSkill('vendedor-especialista.md')
        if (!skill) return 'Você é um consultor de vendas especialista.'
        let prompt = skill.replace(/\$ARGUMENTS/g, 'Nycolas')
        if (catalog) prompt += `\n\n---\n\n# CATÁLOGO DE PRODUTOS\n\n${catalog}`
        return prompt
      },
    },
    lancamento: {
      name: 'Lançamento Pago',
      description: 'Estrategista de lançamentos — Método W',
      icon: '🚀',
      color: '#0ea5e9',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => loadSkill('lancamento-pago.md') || 'Você é um estrategista de lançamentos digitais.',
    },
    concorrentes: {
      name: 'Analise de Concorrentes',
      description: 'Inteligência competitiva e análise de mercado',
      icon: '🔍',
      color: '#f59e0b',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => {
        const skill = loadSkill('analise-concorrentes.md')
        return (skill || 'Você é um analista de inteligência competitiva.') +
          '\n\nIMPORTANTE: Você está rodando em uma interface web. Apresente o relatório completo na resposta.'
      },
    },
    hormozi: {
      name: 'Alex Hormozi',
      description: 'Especialista em negócios, ofertas e escala',
      icon: '💰',
      color: '#ef4444',
      tools: [],
      systemPrompt: () => {
        const agentPath = resolve(ROOT, '.claude/agents/alex-hormozi.md')
        if (existsSync(agentPath)) {
          return readFileSync(agentPath, 'utf-8').replace(/^---[\s\S]*?---\n/, '').trim()
        }
        return 'Você é Alex Hormozi. Especialista em criar ofertas irresistíveis, escalar negócios e maximizar receita.'
      },
    },
    livre: {
      name: 'Chat Livre',
      description: 'Assistente geral com contexto do projeto',
      icon: '💬',
      color: '#10b981',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => {
        const context = catalog ? `\n\n# Contexto do Projeto\n\n${catalog.slice(0, 3000)}` : ''
        return `Você é um assistente inteligente da Márcio Medeiros Educação, empresa especializada em redução de INSS de obras no Brasil. Responda em português.${context}`
      },
    },
    clones: {
      name: 'Arquiteto de Clones IA',
      description: 'Engenharia reversa de mentes humanas e criação de clones IA',
      icon: '🧬',
      color: '#8b5cf6',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => {
        const skillPath = resolve(ROOT, 'skills/skill-clone-agent/skill.md')
        if (existsSync(skillPath)) return readFileSync(skillPath, 'utf-8')
        return 'Você é um Arquiteto de Clones IA especialista em engenharia reversa de mentes humanas e implementação em LLMs.'
      },
    },
    orquestrador: {
      name: 'Orquestrador',
      description: 'Roteia tarefas para o agente certo automaticamente',
      icon: '🧠',
      color: '#6366f1',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => {
        const cmdPath = resolve(ROOT, '.claude/commands/orquestrar.md')
        if (existsSync(cmdPath)) return readFileSync(cmdPath, 'utf-8')
        return 'Você é um orquestrador de agentes IA. Analise o pedido e direcione para o agente mais adequado.'
      },
    },
    'marcio-medeiros': {
      name: 'Márcio Medeiros — Expert',
      description: 'Especialista em INSS de obra, contabilidade imobiliária e tributação',
      icon: '🏗️',
      color: '#1d4ed8',
      tools: [],
      systemPrompt: () => {
        const promptPath = resolve(ROOT, 'marcio-medeiros-educacao/!AGENTS/marcio-medeiros/prompt.md')
        if (existsSync(promptPath)) return readFileSync(promptPath, 'utf-8')
        if (catalog) return `Você é Márcio Medeiros, especialista em INSS de obra e contabilidade imobiliária. Filho de pedreiro que virou contador. Didático, técnico, humilde.\n\n${catalog}`
        return 'Você é Márcio Medeiros, especialista em INSS de obra e contabilidade imobiliária.'
      },
    },
    nycolas: {
      name: 'Nycolas — Estrategista',
      description: 'Estrategista de lançamentos, copy, criativos e narrativas',
      icon: '🚀',
      color: '#7c3aed',
      tools: ['WebSearch', 'WebFetch'],
      systemPrompt: () => {
        const skillPath = resolve(ROOT, 'marcio-medeiros-educacao/!AGENTS/nycolas/skill.md')
        if (existsSync(skillPath)) return readFileSync(skillPath, 'utf-8')
        return 'Você é Nycolas, estrategista de lançamentos digitais e copywriter especializado em Márcio Medeiros Educação. Domina o Método W, criativos, páginas de venda e narrativas de lançamento.'
      },
    },
  }

  return configs[agentId] || null
}

function buildStdinInput(messages, systemPrompt) {
  const history = messages.slice(0, -1)
  const currentMsg = messages[messages.length - 1]
  const historyText = history.length > 0
    ? history.map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\n'
    : ''
  return `<system>\n${systemPrompt}\n</system>\n\n${historyText}${currentMsg.content}`
}

// ── Upload de arquivo ─────────────────────────────────────────────────────
app.post('/api/upload', async (req, res) => {
  const { name, mimeType, base64 } = req.body
  if (!base64 || !mimeType) return res.status(400).json({ error: 'base64 e mimeType são obrigatórios' })

  try {
    const buffer = Buffer.from(base64, 'base64')

    if (mimeType === 'application/pdf') {
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(buffer)
      let content = data.text.replace(/\s+/g, ' ').trim()
      if (content.length > 50000) content = content.slice(0, 50000) + '\n\n[conteúdo truncado — muito longo]'
      return res.json({ name, content, pages: data.numpages })
    }

    // Arquivos texto (utf-8)
    let content = buffer.toString('utf-8')
    if (content.length > 50000) content = content.slice(0, 50000) + '\n\n[conteúdo truncado — muito longo]'
    return res.json({ name, content })
  } catch (err) {
    res.status(500).json({ error: `Falha ao processar arquivo: ${err.message}` })
  }
})

// ── WebFetch ───────────────────────────────────────────────────────────────
app.get('/api/webfetch', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url é obrigatório' })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; agents-ui/1.0)' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const contentType = response.headers.get('content-type') || ''
    let content = await response.text()

    if (contentType.includes('text/html')) {
      content = content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Limitar tamanho para não explodir o contexto
    if (content.length > 30000) content = content.slice(0, 30000) + '\n\n[conteúdo truncado — muito longo]'

    res.json({ url, content, contentType })
  } catch (err) {
    res.status(500).json({ error: `Falha ao buscar URL: ${err.message}` })
  }
})

// ── Rotas ─────────────────────────────────────────────────────────────────

app.get('/api/agents', (req, res) => {
  const agents = ['marcio-medeiros', 'nycolas', 'vendedor', 'lancamento', 'concorrentes', 'hormozi', 'livre', 'clones', 'orquestrador'].map(id => {
    const cfg = buildAgentConfig(id)
    return { id, name: cfg.name, description: cfg.description, icon: cfg.icon, color: cfg.color, tools: cfg.tools }
  })
  res.json(agents)
})

app.get('/api/registry', (req, res) => {
  const registryPath = resolve(ROOT, '.claude/shared-memory/orquestrador-registry.json')
  try {
    res.json(JSON.parse(readFileSync(registryPath, 'utf-8')))
  } catch (err) {
    res.status(500).json({ error: `Falha ao carregar registry: ${err.message}` })
  }
})

// POST /api/chat
app.post('/api/chat', (req, res) => {
  const { agentId, messages, imageBase64, imageMimeType } = req.body

  if (!agentId || !messages?.length) {
    return res.status(400).json({ error: 'agentId e messages são obrigatórios' })
  }

  const agentConfig = buildAgentConfig(agentId)
  if (!agentConfig) {
    return res.status(404).json({ error: `Agente '${agentId}' não encontrado` })
  }

  const systemPrompt = agentConfig.systemPrompt()
  const stdinInput = buildStdinInput(messages, systemPrompt)
  const claudeBin = process.env.CLAUDE_BIN || 'claude'

  // Model routing por complexidade
  const lastMessage = messages[messages.length - 1]?.content || ''
  const complexity = detectComplexity(agentId, lastMessage)
  const model = MODEL_ROUTING[complexity]

  // Monta argumentos do CLI
  const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions', '--model', model]

  // Web search / web fetch se o agente permite
  if (agentConfig.tools?.length) {
    args.push('--allowedTools', agentConfig.tools.join(','))
  }

  // Imagem: salvar em arquivo temporário e passar --image
  let tempImagePath = null
  if (imageBase64 && imageMimeType) {
    const ext = imageMimeType.split('/')[1]?.split(';')[0] || 'jpg'
    tempImagePath = resolve(tmpdir(), `agents-ui-${randomBytes(8).toString('hex')}.${ext}`)
    try {
      writeFileSync(tempImagePath, Buffer.from(imageBase64, 'base64'))
      args.push('--image', tempImagePath)
    } catch (e) {
      console.error('[image write error]', e.message)
    }
  }

  const proc = spawn(claudeBin, args, {
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.end(stdinInput, 'utf-8')

  let stdout = ''
  let stderr = ''
  proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8') })
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8') })

  proc.on('close', (code) => {
    // Limpar arquivo temporário da imagem
    if (tempImagePath && existsSync(tempImagePath)) {
      try { import('fs').then(fs => fs.unlinkSync(tempImagePath)) } catch {}
    }

    if (code !== 0) {
      console.error('[claude stderr]', stderr.slice(0, 500))
      return res.status(500).json({ error: stderr || `claude CLI encerrou com código ${code}` })
    }

    try {
      const parsed = JSON.parse(stdout)
      if (parsed.is_error) {
        return res.status(500).json({ error: parsed.result || 'Erro desconhecido' })
      }

      // Extrair dados de uso da resposta completa do CLI
      const modelKey = Object.keys(parsed.modelUsage || {})[0] || 'claude-sonnet-4-6'
      const modelUsage = parsed.modelUsage?.[modelKey] || {}
      const usage = {
        inputTokens: modelUsage.inputTokens || parsed.usage?.input_tokens || 0,
        outputTokens: modelUsage.outputTokens || parsed.usage?.output_tokens || 0,
        cacheReadInputTokens: modelUsage.cacheReadInputTokens || 0,
        cacheCreationInputTokens: modelUsage.cacheCreationInputTokens || 0,
      }
      const costUSD = modelUsage.costUSD || estimateCost(modelKey, usage)
      const durationMs = parsed.duration_ms || 0

      // Persistir log de uso
      appendUsage({
        timestamp: new Date().toISOString(),
        agentId,
        model: modelKey,
        ...usage,
        costUSD,
        durationMs,
        webSearchRequests: parsed.usage?.server_tool_use?.web_search_requests || 0,
      })

      return res.json({
        text: parsed.result || '',
        usage: { ...usage, costUSD, durationMs, model: modelKey },
        routing: { complexity, modelRequested: model },
      })
    } catch {
      return res.json({ text: stdout.trim() })
    }
  })

  proc.on('error', (err) => {
    console.error('[claude spawn error]', err.message)
    res.status(500).json({ error: `Falha ao iniciar claude CLI: ${err.message}` })
  })

  res.on('close', () => { if (!proc.killed) proc.kill() })
})

// POST /api/chat/stream — Server-Sent Events
app.post('/api/chat/stream', (req, res) => {
  const { agentId, messages, imageBase64, imageMimeType } = req.body

  if (!agentId || !messages?.length) {
    return res.status(400).json({ error: 'agentId e messages são obrigatórios' })
  }

  const agentConfig = buildAgentConfig(agentId)
  if (!agentConfig) {
    return res.status(404).json({ error: `Agente '${agentId}' não encontrado` })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  const systemPrompt = agentConfig.systemPrompt()
  const stdinInput = buildStdinInput(messages, systemPrompt)
  const claudeBin = process.env.CLAUDE_BIN || 'claude'

  // stream-json --verbose: CLI emite NDJSON com eventos granulares
  // (system init, assistant com text/tool_use, user com tool_result, result final).
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
  if (agentConfig.tools?.length) {
    args.push('--allowedTools', agentConfig.tools.join(','))
  }

  let tempImagePath = null
  if (imageBase64 && imageMimeType) {
    const ext = imageMimeType.split('/')[1]?.split(';')[0] || 'jpg'
    tempImagePath = resolve(tmpdir(), `agents-ui-${randomBytes(8).toString('hex')}.${ext}`)
    try {
      writeFileSync(tempImagePath, Buffer.from(imageBase64, 'base64'))
      args.push('--image', tempImagePath)
    } catch (e) {
      console.error('[image write error]', e.message)
    }
  }

  const proc = spawn(claudeBin, args, {
    env: childEnv,
    cwd: AGENT_CWD,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.end(stdinInput, 'utf-8')

  let lineBuffer = ''
  let stderr = ''
  let procDone = false
  let sentAnyDelta = false
  let modelKey = 'claude-sonnet-4-6'
  let finalUsage = null
  let finalResultText = ''

  const handleEvent = (ev) => {
    try {
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const part of ev.message.content) {
          if (part.type === 'text' && part.text) {
            send({ type: 'delta', text: part.text })
            sentAnyDelta = true
          } else if (part.type === 'tool_use') {
            send({ type: 'tool_use', name: part.name, input: part.input, toolUseId: part.id })
          }
        }
      } else if (ev.type === 'user' && ev.message?.content) {
        for (const part of ev.message.content) {
          if (part.type === 'tool_result') {
            send({ type: 'tool_result', toolUseId: part.tool_use_id })
          }
        }
      } else if (ev.type === 'result') {
        if (ev.is_error) {
          send({ type: 'error', message: ev.result || 'Erro desconhecido' })
          return
        }
        modelKey = Object.keys(ev.modelUsage || {})[0] || modelKey
        const mu = ev.modelUsage?.[modelKey] || {}
        finalUsage = {
          inputTokens: mu.inputTokens || ev.usage?.input_tokens || 0,
          outputTokens: mu.outputTokens || ev.usage?.output_tokens || 0,
          cacheReadInputTokens: mu.cacheReadInputTokens || 0,
          cacheCreationInputTokens: mu.cacheCreationInputTokens || 0,
        }
        const costUSD = mu.costUSD || estimateCost(modelKey, finalUsage)
        const durationMs = ev.duration_ms || 0
        finalResultText = ev.result || ''

        appendUsage({
          timestamp: new Date().toISOString(),
          agentId,
          model: modelKey,
          ...finalUsage,
          costUSD,
          durationMs,
          webSearchRequests: ev.usage?.server_tool_use?.web_search_requests || 0,
        })

        // Safety net: se por algum motivo nenhum delta foi emitido durante o stream
        // (respostas muito curtas podem cair só no campo `result`), emite o texto final.
        if (!sentAnyDelta && finalResultText) {
          send({ type: 'delta', text: finalResultText })
        }
        send({ type: 'done', usage: { ...finalUsage, costUSD, durationMs, model: modelKey } })
      }
    } catch (err) {
      console.error('[stream parse]', err.message)
    }
  }

  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString('utf-8')
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        handleEvent(JSON.parse(trimmed))
      } catch {
        // linha quebrada — ignorar
      }
    }
  })
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8') })

  proc.on('close', (code) => {
    procDone = true
    if (tempImagePath && existsSync(tempImagePath)) {
      try { import('fs').then(fs => fs.unlinkSync(tempImagePath)) } catch {}
    }
    // Processa linha residual (caso stream não termine com \n)
    if (lineBuffer.trim()) {
      try { handleEvent(JSON.parse(lineBuffer.trim())) } catch {}
    }
    if (code !== 0 && !finalUsage) {
      send({ type: 'error', message: stderr || `claude CLI encerrou com código ${code}` })
    }
    res.end()
  })

  proc.on('error', (err) => {
    procDone = true
    send({ type: 'error', message: `Falha ao iniciar claude CLI: ${err.message}` })
    res.end()
  })

  res.on('close', () => {
    if (!procDone && !proc.killed) proc.kill('SIGTERM')
  })
})

// GET /api/dashboard — dados de uso agregados
app.get('/api/dashboard', (req, res) => {
  // Stats do Claude Code (uso global)
  const statsPath = resolve(homedir(), '.claude/stats-cache.json')
  let claudeStats = null
  try { claudeStats = JSON.parse(readFileSync(statsPath, 'utf-8')) } catch {}

  // Uso por request registrado pelo agents-ui
  const usageLog = readUsageLog()

  // Agrega por agente
  const byAgent = {}
  for (const r of usageLog.requests) {
    if (!byAgent[r.agentId]) {
      byAgent[r.agentId] = { messages: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, durationMs: 0 }
    }
    byAgent[r.agentId].messages++
    byAgent[r.agentId].inputTokens += r.inputTokens || 0
    byAgent[r.agentId].outputTokens += r.outputTokens || 0
    byAgent[r.agentId].costUSD += r.costUSD || 0
    byAgent[r.agentId].durationMs += r.durationMs || 0
  }

  // Agrega por dia (últimos 14 dias)
  const byDay = {}
  for (const r of usageLog.requests) {
    const day = r.timestamp?.slice(0, 10)
    if (!day) continue
    if (!byDay[day]) byDay[day] = { messages: 0, costUSD: 0, inputTokens: 0, outputTokens: 0 }
    byDay[day].messages++
    byDay[day].costUSD += r.costUSD || 0
    byDay[day].inputTokens += r.inputTokens || 0
    byDay[day].outputTokens += r.outputTokens || 0
  }

  res.json({
    agentsUi: {
      totalRequests: usageLog.requests.length,
      byAgent,
      byDay,
      recent: usageLog.requests.slice(-20).reverse(),
    },
    claudeCode: claudeStats,
  })
})

const PORT = process.env.PORT || 3003
app.listen(PORT, () => {
  console.log(`\n🤖 Agentes API rodando em http://localhost:${PORT}`)
  console.log(`📁 Skills: ${SKILLS_PATH}`)
  console.log(`📂 Agent CWD: ${AGENT_CWD}`)
  console.log(`📊 Usage log: ${USAGE_LOG}`)
  console.log(`🔑 Auth: claude CLI (OAuth — sem custo de API)`)
})
