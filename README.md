# Agents UI — Interface Web para Agentes Claude Code

Interface visual para conversar com os agentes do projeto Márcio Medeiros Educação diretamente no navegador, sem depender do terminal do Claude Code.

Usa o `claude` CLI como backend de inferência — aproveita a autenticação OAuth do seu plano Claude Code (Max/Pro), **sem consumir créditos da API Anthropic**.

---

## Pré-requisitos

- **Node.js** v18 ou superior
- **Claude Code** instalado e autenticado (`claude` disponível no PATH)
  - Verifique: `claude --version`
  - Autentique se necessário: `claude` (segue o fluxo de login)

---

## Instalação

```bash
cd agents-ui
npm install
```

---

## Configuração

Crie (ou edite) o arquivo `.env` em `agents-ui/`:

```env
PORT=3003
```

> Não é necessário `ANTHROPIC_API_KEY`. O servidor usa o `claude` CLI com as credenciais OAuth do Claude Code.

---

## Como iniciar

```bash
cd agents-ui
npm run dev:all
```

Isso sobe dois processos em paralelo:

| Processo | URL | Descrição |
|----------|-----|-----------|
| Vite (frontend) | http://localhost:5174 | Interface React no navegador |
| Express (backend) | http://localhost:3003 | API que invoca o claude CLI |

Abra **http://localhost:5174** no navegador.

### Comandos individuais

```bash
npm run dev          # só o frontend (Vite)
npm run dev:server   # só o backend (Express)
npm run dev:all      # ambos juntos (recomendado)
npm run build        # build de produção do frontend
```

---

## Arquitetura

```
Navegador (React)
    │
    │  POST /api/chat { agentId, messages[] }
    ▼
Express (porta 3003)
    │  1. Lê o arquivo .md da skill correspondente
    │  2. Monta o system prompt
    │  3. spawn('claude', ['-p', '--output-format', 'json'])
    │     stdin ← <system>...prompt...</system>\n\nmensagem
    │     stdout → JSON { result: "resposta" }
    ▼
claude CLI (processo filho)
    │  CLAUDECODE removido do env → evita erro de sessão aninhada
    │  ANTHROPIC_API_KEY removido → usa OAuth do Claude Code
    ▼
API Anthropic (via plano Max/Pro — sem custo adicional)
```

### Por que remover as variáveis de ambiente?

```javascript
const childEnv = { ...process.env }
delete childEnv.CLAUDECODE        // evita "nested session" error
delete childEnv.ANTHROPIC_API_KEY // força uso do OAuth (plano Max/Pro)
```

- `CLAUDECODE` presente → o CLI recusa rodar dentro de outra sessão Claude Code
- `ANTHROPIC_API_KEY` presente → o CLI usa a chave direta (que pode não ter créditos)
- Ambas removidas → o CLI usa as credenciais OAuth salvas em `~/.claude/`

---

## Agentes disponíveis

| Agente | Ícone | Arquivo de origem | Contexto extra |
|--------|-------|-------------------|----------------|
| Vendedor Especialista | 🎯 | `skills/vendedor-especialista.md` | Catálogo completo injetado automaticamente |
| Lançamento Pago | 🚀 | `skills/lancamento-pago.md` | — |
| Analise de Concorrentes | 🔍 | `skills/analise-concorrentes.md` | Nota sobre output inline (sem salvar arquivos) |
| Alex Hormozi | 💰 | `.claude/agents/alex-hormozi.md` | Frontmatter YAML removido automaticamente |
| Chat Livre | 💬 | prompt inline | Primeiros 3.000 chars do catálogo como contexto |

---

## Estrutura de arquivos

```
agents-ui/
├── .env                    # configuração local (PORT=3003)
├── .env.example            # template de configuração
├── package.json            # dependências e scripts
├── vite.config.js          # Vite: porta 5174, proxy /api → 3003
├── tailwind.config.js      # tema escuro customizado
├── postcss.config.js       # processamento de CSS
├── index.html              # entry point HTML
│
├── src/                    # Frontend React
│   ├── main.jsx            # monta o React no DOM
│   ├── index.css           # Tailwind + estilos markdown do chat
│   ├── App.jsx             # layout sidebar + chat, carrega agentes
│   ├── components/
│   │   ├── Sidebar.jsx     # lista de agentes com cards clicáveis
│   │   └── ChatWindow.jsx  # área de chat, histórico, animação, markdown
│   └── lib/
│       └── api.js          # fetch para /api/chat, animação de digitação
│
└── server/                 # Backend Express
    └── index.js            # rotas GET /api/agents e POST /api/chat
```

---

## Como adicionar um novo agente

1. Crie (ou use um existente) arquivo `.md` com o system prompt em `skills/` ou `.claude/agents/`

2. Adicione a configuração em `server/index.js`, dentro de `buildAgentConfig()`:

```javascript
meu_agente: {
  name: 'Nome do Agente',
  description: 'Descrição curta',
  icon: '🤖',
  color: '#6366f1',
  systemPrompt: () => {
    const skill = loadSkill('meu-agente.md')
    return skill || 'Fallback se o arquivo não existir.'
  },
},
```

3. Adicione o ID na lista de agentes do endpoint `GET /api/agents`:

```javascript
const agents = ['vendedor', 'lancamento', 'concorrentes', 'hormozi', 'livre', 'meu_agente'].map(...)
```

4. Opcionalmente, adicione uma mensagem de boas-vindas em `src/components/ChatWindow.jsx`:

```javascript
const welcomes = {
  // ...agentes existentes...
  meu_agente: `Olá! Sou o agente de X. Como posso ajudar?`,
}
```

Reinicie o servidor (`npm run dev:server`) para aplicar as mudanças.

---

## Solução de problemas

| Erro | Causa provável | Solução |
|------|---------------|---------|
| `Servidor não encontrado` | Backend não está rodando | `npm run dev:server` |
| `Falha ao iniciar claude CLI` | `claude` não está no PATH | Instalar Claude Code: `npm i -g @anthropic-ai/claude-code` |
| `credit balance too low` | `ANTHROPIC_API_KEY` com saldo zero está no `.env` | Remover a key do `.env` (o OAuth resolve) |
| `nested session error` | `CLAUDECODE` env var presente | Já tratado no servidor automaticamente |
| Porta em uso | Processo anterior ainda rodando | Matar com `npm run dev:all` ou reiniciar o terminal |
