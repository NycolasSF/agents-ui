# Tarefa: Adicionar Sistema de Preview/Artifacts ao agents-ui

## Contexto do Projeto

Este é o projeto `agents-ui` — uma interface web React + Express que conversa com agentes Claude Code via o `claude` CLI como backend. Leia o `README.md` na raiz para entender a arquitetura completa antes de começar.

**Stack atual:**
- Frontend: React + Vite + Tailwind (porta 5174)
- Backend: Express (porta 3003) que faz `spawn('claude', ...)` 
- Comunicação: POST `/api/chat` → resposta JSON `{ result: "texto" }`
- Componentes: `App.jsx` (layout), `Sidebar.jsx` (agentes), `ChatWindow.jsx` (chat), `api.js` (fetch)

**O que NÃO mudar:**
- Sistema de agentes (Sidebar, seleção, configuração em `server/index.js`)
- Autenticação OAuth via claude CLI
- Remoção de `CLAUDECODE` e `ANTHROPIC_API_KEY` do env do processo filho
- Estrutura de pastas `skills/` e `.claude/agents/`
- Porta do Vite (5174) e do Express (3003)

---

## Objetivo

Adicionar um **painel de preview** ao lado do chat que renderiza automaticamente código HTML, SVG e CSS gerados pelos agentes. O sistema deve ter 3 capacidades:

1. **Streaming real** — trocar a comunicação atual (JSON completo) por Server-Sent Events para mostrar a resposta sendo "digitada" em tempo real
2. **Parsing de artifacts** — detectar blocos de código (` ```html `, ` ```svg `, ` ```css `) na resposta e extraí-los como "artifacts" renderizáveis
3. **Sandboxing** — renderizar os artifacts em iframes isolados com atributo `sandbox` restritivo

---

## Plano de Implementação

### Fase 1: Streaming no Backend (server/index.js)

Criar um novo endpoint `POST /api/chat/stream` que retorna Server-Sent Events em vez de JSON.

**Comportamento esperado:**
```
Cliente envia POST /api/chat/stream { agentId, messages }
Servidor responde com Content-Type: text/event-stream
Cada chunk de texto do claude CLI → evento SSE: data: {"type":"delta","text":"..."}
Fim do stream → evento SSE: data: {"type":"done"}
Erro → evento SSE: data: {"type":"error","message":"..."}
```

**Detalhes técnicos:**
- Usar `spawn('claude', ['-p', '--output-format', 'stream-json'])` ou ler o stdout do processo linha por linha se `stream-json` não estiver disponível
- Se o CLI não suportar streaming nativo, simular lendo stdout com `child.stdout.on('data', chunk => ...)` e enviando cada chunk como SSE
- Manter o endpoint antigo `POST /api/chat` funcionando como fallback
- Headers obrigatórios: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Tratar `req.on('close')` para matar o processo filho se o cliente desconectar

**Exemplo de implementação:**
```javascript
app.post('/api/chat/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const child = spawn('claude', ['-p', '--output-format', 'json'], {
    env: childEnv
  })

  child.stdin.write(prompt)
  child.stdin.end()

  let buffer = ''
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    buffer += text
    res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
  })

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ type: 'done', full: buffer })}\n\n`)
    res.end()
  })

  child.stderr.on('data', (data) => {
    console.error('claude stderr:', data.toString())
  })

  req.on('close', () => {
    child.kill('SIGTERM')
  })
})
```

> **IMPORTANTE**: Testar primeiro manualmente se `spawn('claude', ['-p'])` envia dados progressivamente no stdout ou se envia tudo de uma vez. Adaptar a estratégia de acordo. Se o CLI bufferar toda a saída, a simulação de streaming no frontend ainda funciona visualmente com a resposta completa sendo "digitada".

### Fase 2: Cliente de Streaming (src/lib/api.js)

Adicionar uma função `streamChat()` ao módulo `api.js` que consome o endpoint SSE.

**Interface:**
```javascript
export async function streamChat({ agentId, messages, onDelta, onDone, onError, signal }) {
  // signal: AbortSignal para cancelar mid-stream
  // onDelta(text): chamado a cada chunk de texto
  // onDone(fullText): chamado quando o stream termina
  // onError(error): chamado em caso de erro
}
```

**Implementação:**
- Usar `fetch()` com leitura via `response.body.getReader()` + `TextDecoder`
- Parsear linhas SSE: split por `\n`, filtrar linhas que começam com `data: `, fazer `JSON.parse`
- Aceitar um `AbortSignal` para permitir cancelamento pelo usuário
- Manter a função `sendMessage()` existente como fallback

### Fase 3: Parser de Artifacts (src/lib/artifactParser.js)

Criar um novo módulo que extrai blocos de código da resposta.

**Criar arquivo `src/lib/artifactParser.js` com:**

```javascript
// Tipos de artifact suportados
const ARTIFACT_TYPES = [
  { id: 'html', regex: /```html\n([\s\S]*?)```/g, previewable: true },
  { id: 'svg',  regex: /```svg\n([\s\S]*?)```/g,  previewable: true },
  { id: 'css',  regex: /```css\n([\s\S]*?)```/g,  previewable: false },
  { id: 'js',   regex: /```(?:javascript|js)\n([\s\S]*?)```/g, previewable: false },
  { id: 'python', regex: /```python\n([\s\S]*?)```/g, previewable: false },
  { id: 'json', regex: /```json\n([\s\S]*?)```/g, previewable: false },
]

export function parseArtifacts(text) { ... }
export function hasOpenCodeBlock(text) { ... }
export function getPreviewableArtifacts(text) { ... }
```

**Regras do parser:**
- Deve funcionar com texto parcial (durante streaming) — detectar blocos já fechados
- `hasOpenCodeBlock()` retorna true se há um ` ``` ` aberto sem fechar (streaming em andamento)
- `getPreviewableArtifacts()` retorna apenas artifacts que podem ser renderizados (html, svg)
- Cada artifact deve ter: `{ id, type, label, content, previewable, startIndex }`

### Fase 4: Layout Split View (src/App.jsx)

Modificar o layout principal para ter dois painéis: chat (esquerda) + preview (direita).

**Comportamento:**
- Layout padrão: chat ocupa 100% da largura (como está hoje)
- Quando um artifact previewable é detectado: o layout divide em 50/50 (ou com drag para redimensionar)
- Um botão permite fechar o painel de preview e voltar ao layout full
- Em telas menores que 768px: preview aparece como tab/overlay em vez de split

**Estrutura de estado no App.jsx:**
```javascript
const [previewContent, setPreviewContent] = useState(null) // { content, type }
const [showPreview, setShowPreview] = useState(false)
```

**Passar para ChatWindow:**
```jsx
<ChatWindow
  agent={selectedAgent}
  onArtifactDetected={(artifact) => {
    setPreviewContent(artifact)
    setShowPreview(true)
  }}
/>
```

### Fase 5: Componente de Preview (src/components/PreviewPanel.jsx)

Criar novo componente `PreviewPanel.jsx`.

**Estrutura com 3 tabs:**
1. **Preview** — iframe sandboxed renderizando o HTML/SVG
2. **Código** — bloco de código com syntax highlighting e botão copiar
3. **Histórico** — lista de todos os artifacts da conversa atual

**Sandbox do iframe:**
```jsx
<iframe
  srcDoc={htmlContent}
  sandbox="allow-scripts allow-modals"
  // NÃO incluir allow-same-origin (isolamento total)
  // NÃO incluir allow-forms (previne phishing)
  // NÃO incluir allow-popups (previne window.open)
  title="Preview"
/>
```

**Regras de construção do `srcDoc`:**
- Se o conteúdo é SVG: envolver em `<html><body style="display:flex;align-items:center;justify-content:center;min-height:100vh">` + conteúdo SVG + `</body></html>`
- Se o conteúdo é HTML parcial (sem `<html>`): envolver em documento HTML completo com charset UTF-8
- Se o conteúdo é HTML completo (tem `<!DOCTYPE` ou `<html`): usar direto
- Sempre adicionar `<meta name="viewport" content="width=device-width,initial-scale=1">`

### Fase 6: Integrar Streaming + Parsing no ChatWindow

Modificar `ChatWindow.jsx` para:

1. Usar `streamChat()` em vez de `sendMessage()` (com fallback)
2. Manter um state `streamingText` que acumula os deltas
3. A cada update de `streamingText`, rodar `parseArtifacts()` para detectar novos artifacts
4. Quando um artifact previewable é detectado, chamar `onArtifactDetected(artifact)`
5. Mostrar cursor piscante durante streaming
6. Adicionar botão "Parar" que aborta o stream via `AbortController`

**Estado adicional no ChatWindow:**
```javascript
const [isStreaming, setIsStreaming] = useState(false)
const abortControllerRef = useRef(null)
```

---

## Critérios de Qualidade

### DEVE ter:
- [ ] Streaming funcional com SSE (texto aparecendo progressivamente)
- [ ] Detecção automática de code blocks HTML e SVG nas respostas
- [ ] Preview renderizado em iframe sandboxed (sem `allow-same-origin`)
- [ ] Botão "Parar" que cancela o stream e mantém o texto recebido até ali
- [ ] Preview abre automaticamente quando um artifact previewable é detectado
- [ ] Botão de fechar o painel de preview
- [ ] Botão "Copiar código" no bloco de código
- [ ] Layout responsivo (split view em desktop, stack em mobile)
- [ ] Backend mata o processo filho se o cliente desconectar
- [ ] Endpoint antigo `POST /api/chat` continua funcionando

### BOM ter:
- [ ] Animação suave de abertura do painel de preview
- [ ] Tabs no preview (Preview / Código / Histórico)
- [ ] Drag handle para redimensionar os painéis
- [ ] Preview atualiza em tempo real durante o streaming (assim que o bloco fecha)
- [ ] Indicador visual de "streaming..." com animação
- [ ] Auto-scroll no chat durante streaming

### NÃO fazer:
- NÃO mudar o sistema de agentes existente
- NÃO adicionar autenticação ou login
- NÃO instalar bibliotecas pesadas de syntax highlighting (usar estilização CSS simples)
- NÃO usar localStorage para persistir estado
- NÃO criar rotas ou páginas novas (tudo dentro do layout existente)

---

## Ordem de Execução

1. Primeiro: ler todos os arquivos existentes do projeto para entender o código atual
2. `server/index.js` — adicionar endpoint SSE
3. `src/lib/artifactParser.js` — criar parser (novo arquivo)
4. `src/lib/api.js` — adicionar `streamChat()`
5. `src/components/PreviewPanel.jsx` — criar componente (novo arquivo)
6. `src/components/ChatWindow.jsx` — integrar streaming + parsing + callback de artifacts
7. `src/App.jsx` — adicionar split layout com PreviewPanel
8. `src/index.css` — estilos adicionais se necessário
9. Testar enviando mensagem que gere HTML e verificar se o preview aparece

---

## Notas Técnicas

- O `claude` CLI pode não enviar stdout progressivamente (pode bufferar). Se isso acontecer, o streaming no frontend funciona visualmente "digitando" a resposta completa, mas a latência até o primeiro token será igual à de hoje. Documentar esse comportamento.
- O parser precisa ser resiliente a markdown malformado — blocos sem fechar, linguagem não especificada, etc.
- O iframe com `sandbox` sem `allow-same-origin` impede `postMessage` bidirecional — se futuramente precisar comunicação iframe↔pai, considerar usar `allow-same-origin` com CSP headers.
- Manter todo CSS novo em Tailwind classes quando possível, inline styles ou `index.css` para o restante.
