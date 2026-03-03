import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const SKILLS_PATH = process.env.SKILLS_PATH
  ? resolve(__dirname, '..', process.env.SKILLS_PATH)
  : resolve(ROOT, 'skills')

// Env limpa para o processo filho:
// - Remove CLAUDECODE para evitar erro de "sessão aninhada"
// - Remove ANTHROPIC_API_KEY para forçar o CLI a usar o OAuth do Claude Code (plano Max/Pro)
const childEnv = { ...process.env }
delete childEnv.CLAUDECODE
delete childEnv.ANTHROPIC_API_KEY

const app = express()
app.use(cors())
app.use(express.json())

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
      systemPrompt: () => {
        const skill = loadSkill('vendedor-especialista.md')
        if (!skill) return 'Você é um consultor de vendas especialista.'
        let prompt = skill.replace(/\$ARGUMENTS/g, 'Nycolas')
        if (catalog) {
          prompt += `\n\n---\n\n# CATÁLOGO DE PRODUTOS (USE SEMPRE ESTE MATERIAL)\n\n${catalog}`
        }
        return prompt
      },
    },
    lancamento: {
      name: 'Lançamento Pago',
      description: 'Estrategista de lançamentos — Método W',
      icon: '🚀',
      color: '#0ea5e9',
      systemPrompt: () => {
        const skill = loadSkill('lancamento-pago.md')
        return skill || 'Você é um estrategista de lançamentos digitais.'
      },
    },
    concorrentes: {
      name: 'Analise de Concorrentes',
      description: 'Inteligência competitiva e análise de mercado',
      icon: '🔍',
      color: '#f59e0b',
      systemPrompt: () => {
        const skill = loadSkill('analise-concorrentes.md')
        const base = skill || 'Você é um analista de inteligência competitiva.'
        return base + `\n\nIMPORTANTE: Você está rodando em uma interface web. Não é possível salvar arquivos automaticamente. Apresente o relatório completo na resposta e o usuário poderá copiá-lo.`
      },
    },
    hormozi: {
      name: 'Alex Hormozi',
      description: 'Especialista em negócios, ofertas e escala',
      icon: '💰',
      color: '#ef4444',
      systemPrompt: () => {
        const agentPath = resolve(ROOT, '.claude/agents/alex-hormozi.md')
        if (existsSync(agentPath)) {
          const raw = readFileSync(agentPath, 'utf-8')
          return raw.replace(/^---[\s\S]*?---\n/, '').trim()
        }
        return 'Você é Alex Hormozi. Especialista em criar ofertas irresistíveis, escalar negócios e maximizar receita.'
      },
    },
    livre: {
      name: 'Chat Livre',
      description: 'Assistente geral com contexto do projeto',
      icon: '💬',
      color: '#10b981',
      systemPrompt: () => {
        const context = catalog ? `\n\n# Contexto do Projeto\n\n${catalog.slice(0, 3000)}` : ''
        return `Você é um assistente inteligente da Márcio Medeiros Educação, empresa especializada em redução de INSS de obras e contabilidade imobiliária no Brasil. Responda sempre em português brasileiro, com clareza e objetividade.${context}`
      },
    },
  }

  return configs[agentId] || null
}

// Formata o histórico + mensagem atual para stdin do claude CLI
function buildStdinInput(messages, systemPrompt) {
  const history = messages.slice(0, -1)
  const currentMsg = messages[messages.length - 1]

  const historyText = history.length > 0
    ? history.map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\n'
    : ''

  // Sistema vai inline no prompt para contornar limite de tamanho de arg
  return `<system>\n${systemPrompt}\n</system>\n\n${historyText}${currentMsg.content}`
}

app.get('/api/agents', (req, res) => {
  const agents = ['vendedor', 'lancamento', 'concorrentes', 'hormozi', 'livre'].map(id => {
    const cfg = buildAgentConfig(id)
    return { id, name: cfg.name, description: cfg.description, icon: cfg.icon, color: cfg.color }
  })
  res.json(agents)
})

// POST /api/chat — resposta completa via JSON (claude CLI)
app.post('/api/chat', (req, res) => {
  const { agentId, messages } = req.body

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

  const proc = spawn(claudeBin, ['-p', '--output-format', 'json'], {
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stdin.end(stdinInput, 'utf-8')

  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8') })
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8') })

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('[claude stderr]', stderr.slice(0, 500))
      return res.status(500).json({ error: stderr || `claude CLI encerrou com código ${code}` })
    }
    try {
      const parsed = JSON.parse(stdout)
      if (parsed.is_error) {
        return res.status(500).json({ error: parsed.result || 'Erro desconhecido' })
      }
      return res.json({ text: parsed.result || '' })
    } catch {
      // fallback: retorna stdout bruto se não for JSON válido
      return res.json({ text: stdout.trim() })
    }
  })

  proc.on('error', (err) => {
    console.error('[claude spawn error]', err.message)
    res.status(500).json({ error: `Falha ao iniciar claude CLI: ${err.message}` })
  })

  // Matar o processo se o CLIENTE fechar a conexão antes da resposta
  res.on('close', () => {
    if (!proc.killed) proc.kill()
  })
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(`\n🤖 Agentes API rodando em http://localhost:${PORT}`)
  console.log(`📁 Skills: ${SKILLS_PATH}`)
  console.log(`🔑 Auth: claude CLI (usa sessão do Claude Code — sem custo de API)`)
})
