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

// ── Rotas ─────────────────────────────────────────────────────────────────

app.get('/api/agents', (req, res) => {
  const agents = ['vendedor', 'lancamento', 'concorrentes', 'hormozi', 'livre'].map(id => {
    const cfg = buildAgentConfig(id)
    return { id, name: cfg.name, description: cfg.description, icon: cfg.icon, color: cfg.color, tools: cfg.tools }
  })
  res.json(agents)
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

  // Monta argumentos do CLI
  const args = ['-p', '--output-format', 'json']

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
  console.log(`📊 Usage log: ${USAGE_LOG}`)
  console.log(`🔑 Auth: claude CLI (OAuth — sem custo de API)`)
})
