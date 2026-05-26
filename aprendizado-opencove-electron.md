# Aprendizado — Arquitetura Electron do OpenCove

> Referência: `DeadWaveWave/opencove` v0.2.0-nightly (MIT), analisado em 19/04/2026 para embasar a migração do `agents-ui` web → Electron.
>
> - Repo local (não versionado): `F:/claude-projetos/tmp/opencove-source/`
> - Instalador Windows: `C:\Users\nycol\Downloads\opencove\OpenCove-0.2.0-nightly-win-x64.exe` (229 MB)
> - Motivação: replicar o comportamento do Maestri (canvas infinito + terminais conectáveis com PTY-to-PTY) num stack open source e Windows-friendly.

---

## Sumário

1. [Visão geral — por que importa pro agents-ui](#1-visão-geral)
2. [Stack técnica comparada](#2-stack-técnica-comparada)
3. [Arquitetura macro: DDD + Clean + Control Surface](#3-arquitetura-macro-ddd--clean--control-surface)
4. [Modelo de 5 processos Electron](#4-modelo-de-5-processos-electron)
5. [Camada Agent — o coração do sistema](#5-camada-agent--o-coração-do-sistema)
6. [Camada Terminal + PTY Host](#6-camada-terminal--pty-host)
7. [Canvas infinito (React Flow)](#7-canvas-infinito-react-flow)
8. [Persistência (SQLite + Drizzle + PRAGMA user_version)](#8-persistência)
9. [Filesystem com URI + ApprovedWorkspaceStore](#9-filesystem-com-uri--guardrails)
10. [IPC: padrão typed + Zod + Result](#10-ipc-padrão-typed--zod--result)
11. [CLI externo (`opencove`)](#11-cli-externo)
12. [i18n (namespaces aninhados)](#12-i18n)
13. [Segurança Electron — checklist](#13-segurança-electron)
14. [Roadmap sugerido pro agents-ui](#14-roadmap-sugerido-pro-agents-ui)
15. [Referências](#15-referências)

---

## 1. Visão geral

O `agents-ui` atual é **web puro** (React + Vite em 5174, Express em 3003, spawn síncrono do `claude` CLI, localStorage). Limites:

- Sem PTY real → `api.js` simula digitação (6 chars/8ms) em vez de stream.
- Sem canvas infinito → agentes viram abas, não nós espaciais.
- Sem persistência robusta → localStorage some e `data/usage.json` não escala.
- Sem multi-sessão simultânea → uma requisição de cada vez.
- Sem acesso remoto → não dá pra acompanhar do celular.

**OpenCove resolveu exatamente esses cinco problemas** com padrões MIT copiáveis. Este doc é o mapa pra puxar o que importa.

## 2. Stack técnica comparada

| Camada | `agents-ui` hoje | OpenCove |
|---|---|---|
| Runtime | Browser + Node | Electron 35 (Chromium + Node) |
| Build | Vite 5 | **electron-vite 5** (5 entrypoints) |
| UI | React 18 + Tailwind 3 | React 19 + Tailwind 4 |
| State | `useState` + localStorage | **Zustand** |
| Persistência | `data/usage.json` + localStorage | **better-sqlite3 + Drizzle ORM** |
| Terminal | ❌ animação fake | **xterm.js + 7 addons + node-pty** |
| Canvas | ❌ (abas) | **@xyflow/react (React Flow 12)** |
| IPC | HTTP Express | **Typed IPC + Zod + contextBridge** |
| Auto-update | ❌ | `electron-updater` + GitHub Releases |
| Acesso remoto | ❌ | Worker HTTP local + Web UI |
| i18n | ❌ | en.ts + zh-CN.ts com namespaces |
| Testes | ❌ | Vitest + Playwright E2E |
| DI/Arq | monolito (`server/index.js`) | **DDD por contexts + Clean** |

## 3. Arquitetura macro: DDD + Clean + Control Surface

**Princípio #1 — Context é unidade primária.** Não existe `components/`, `services/`, `utils/` na raiz. Existe **contexto de domínio** (agent, terminal, task, space, workspace, filesystem…). OpenCove tem 13:

```
src/contexts/
├── agent/         task/          space/
├── terminal/      workspace/     session/
├── filesystem/    worktree/      settings/
├── project/       update/        integration/
├── clipboard/     releaseNotes/  system/
```

Cada context é **autossuficiente** e responde 4 perguntas (`AGENTS.md:1-15`):
1. Qual *durable truth* possui?
2. O que **não** possui (e delega a outro)?
3. Quais estados são fatos vs observações de runtime?
4. Como colabora (eventos? portas?)?

**Princípio #2 — Clean dentro de cada context:**

```
contexts/agent/
├── domain/          ← regras puras, zero Electron/Node
│   ├── AgentRuntimeStatus.ts
│   ├── AgentProvider.ts
│   └── events/
├── application/     ← use cases (orquestram domain)
│   └── usecases/launchAgent.ts
├── infrastructure/  ← IO: spawn CLI, parse JSONL, disk polling
│   ├── watchers/SessionTurnStateWatcher.ts
│   └── AgentSessionLocator.ts
└── presentation/    ← IPC handlers + componentes React
    ├── main-ipc/register.ts
    └── renderer/AgentNode.tsx
```

Regra de ouro: **dependência só aponta pra dentro** (domain ← application ← infrastructure/presentation). O `main/`, `preload/`, `renderer/` são apenas composição + boundary de processo, **zero lógica de negócio**.

**Princípio #3 — Control Surface (`docs/CONTROL_SURFACE.md`)**: toda capacidade externa (CLI, HTTP, IPC Electron, Worker remoto) passa por uma única fachada:

```
Client (IPC | HTTP | SSH)
  ↓ runtime validate
Main/IPC Handler (mapping only)
  ↓ no business logic
Control Surface (read | write | command)
  ↓
application/usecases (owner logic)
  ↓
domain
```

**Por que isso salva o agents-ui:** hoje, `server/index.js` mistura (1) config de agentes, (2) spawn CLI, (3) roteamento HTTP, (4) usage tracking. Se migrarmos pra Electron sem separar, isso vira N×M caos. **Separar ANTES é migração barata depois.**

## 4. Modelo de 5 processos Electron

`electron.vite.config.ts` declara **5 entrypoints** compilados em paralelo:

| Processo | Entry | Responsabilidade |
|---|---|---|
| **main** | `src/app/main/index.ts` | Orquestra app lifecycle, cria janelas, registra IPC handlers |
| **worker** | `src/app/worker/index.ts` | Headless HTTP server (Web UI remota + CLI) |
| **ptyHost** | `src/platform/process/ptyHost/entry.ts` | Processo isolado que spawna shells/CLIs |
| **preload** | `src/app/preload/index.ts` | Bridge main↔renderer via `contextBridge` |
| **renderer** | `src/app/renderer/` | React UI; 2 HTMLs: `index.html` (Electron) + `web.html` (browser) |

**Por que 5?**

- `main` só **decide** — zero IO pesado, UI thread protegida.
- `worker` permite rodar OpenCove **sem janela** (modo servidor) e expor a UI via HTTP na LAN. É o que permite acessar do celular.
- `ptyHost` isola `node-pty`. Um shell travado não derruba a UI. Também facilita *cleanup de spawn-helpers órfãos* no macOS/Linux.
- `preload` é o **único canal** main↔renderer. Sem ele, sem IPC. Sem lógica — só mapping.
- `renderer` é React puro, sem `nodeIntegration`, sem `require`. Duas builds pro mesmo código: uma embutida no Electron, outra servida pelo worker.

### Bootstrap do main (`src/app/main/index.ts:1-150`)

```typescript
configureAppCommandLine()        // força sRGB, desliga backgrounding
configureAppUserDataPath()       // define pasta do userData

const mainWindow = new BrowserWindow({
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,         // ← NÃO NEGOCIÁVEL
  nodeIntegration: false,
  sandbox: !disableRendererSandboxForTests,
  webPreferences: {
    additionalArguments: [`--opencove-main-process-pid=${process.pid}`],
  },
})

// Close coordena flush antes de fechar — não perde dados
mainWindow.on('close', (event) => {
  event.preventDefault()
  requestRendererPersistFlush(mainWindow.webContents, 1500)
    .finally(() => mainWindow.close())
})

registerIpcHandlers()
registerControlSurfaceServer()    // HTTP + WS pro modo remoto
```

**Detalhe copiável:** o `mainWindow.on('close')` faz `preventDefault` e pede ao renderer pra fazer flush de persistência (com timeout de 1.5s) antes de fechar. Garante que nada é perdido ao dar X.

### Worker headless (`src/app/worker/index.ts`)

```typescript
const approvedWorkspaces = createApprovedWorkspaceStoreForPath(userDataPath)
const ptyRuntime = createHeadlessPtyRuntime({ userDataPath })
const server = registerControlSurfaceHttpServer({
  userDataPath,
  hostname: '127.0.0.1',          // loopback por padrão
  bindHostname, port,
  token,                           // auth Bearer
  webUiPasswordHash,               // senha opcional pra Web UI
})
```

Mesmos contracts Control Surface expostos via HTTP `POST /invoke`.

### PTY Host (`src/platform/process/ptyHost/entry.ts`)

Worker Thread (não main thread), comunicação via `parentPort`:

```typescript
// Protocol versionado: PTY_HOST_PROTOCOL_VERSION
// Cleanup de spawn-helpers órfãos (macOS/Linux)
cleanupOrphanedNodePtySpawnHelpers()

parentPort.on('message', (data) => {
  if (!isPtyHostRequest(data)) return
  switch (data.type) {
    case 'spawn':  spawn(data); break
    case 'write':  pty.write(data.data); break
    case 'resize': pty.resize(data.cols, data.rows); break
    case 'kill':   process.kill(pty.pid); break
  }
})
```

## 5. Camada Agent — o coração do sistema

É aqui que o OpenCove vira "canvas de Claude Code". Estrutura:

```
contexts/agent/
├── domain/
│   └── AgentRuntimeStatus.ts   ← 'running' | 'standby' | 'exited' | 'failed' | 'stopped' | 'restoring'
├── application/
│   └── usecases/launchAgent.ts
├── infrastructure/
│   ├── AgentSessionLocator.ts          ← acha sessão externa já criada
│   ├── watchers/SessionTurnStateWatcher.ts     ← detecta turn transitions
│   ├── watchers/SessionLastAssistantMessage.ts ← última msg (pra recovery UI)
│   ├── watchers/OpenCodeSessionStateWatcher.ts ← HTTP polling
│   └── watchers/GeminiSessionStateWatcher.ts
└── presentation/
    └── main-ipc/register.ts            ← IPC handlers
```

### Fluxo de launch (`presentation/main-ipc/register.ts:197-342`)

```typescript
// 1. Normalize + valida payload (Zod)
const input = normalizeLaunchAgentPayload(payload)

// 2. Gate de segurança: workspace aprovado?
await ensureApprovedWorkspace(input.cwd)

// 3. Constrói comando específico do provider
const { command, args } = buildAgentLaunchCommand(input)
//   Claude Code:  claude --resume <id> --model <m> --print <prompt>
//   Codex:        codex (OPENAI_API_KEY no env)
//   Gemini:       gemini --model <m>
//   OpenCode:     opencode server --port <auto> (sobe HTTP server local)

// 4. Windows: resolve .bat/.cmd e envolve em cmd.exe /d /c
const invocation = resolveAgentCliInvocation(command, args)

// 5. OpenCode: reserva porta loopback
const serverPort = await reserveLoopbackPort() // 67-90

// 6. Spawna via ptyHost
const { sessionId } = await ptyRuntime.spawnSession(invocation)

// 7. Inicia watcher provider-aware (Gemini tem cursor tracking)
startSessionStateWatcher({ provider: input.provider, sessionId, cwd })

// 8. Retorna handle ao renderer
return { sessionId, provider, launchMode, effectiveModel, resumeSessionId }
```

### Resumption: como o OpenCove "encontra" a sessão do Claude Code

O grande truque: Claude Code escreve arquivos JSONL em `~/.claude/projects/<hash>/`. OpenCove não **cria** sessão — ele **observa** essa pasta via polling com deadline.

```typescript
// AgentSessionLocator.ts:310-318
async function locateAgentResumeSessionId(params) {
  return await pollUntil(
    Date.now() + 2_600,            // deadline ~2.6s
    async () => {
      const files = await listFiles(sessionsDir)
      const latest = files
        .filter(f => /* match by CWD + timestamp */)
        .sort(byMtime)[0]
      if (!latest) return null
      const meta = await readFirstJsonLine(latest)  // session_meta
      return normalizeCwd(meta.cwd) === normalizeCwd(params.cwd)
        ? meta.sessionId : null
    },
    { intervalMs: 120 },
  )
}
```

**Paths monitorados por provider:**
- Claude Code: `~/.claude/projects/<slugified-cwd>/<sessionId>.jsonl`
- Codex: `~/.codex/sessions/<date>/...`
- OpenCode: `~/.opencode/...`
- Gemini: config próprio

### Turn State Watcher

Detecta quando o agente terminou um turno (pra habilitar o input de novo, mostrar "Tool waiting approval", etc) lendo `mtime` do JSONL + último evento serializado.

### 📋 O que copiar pro agents-ui

1. **Estado finito enum** pra runtime: `running | standby | exited | failed | stopped | restoring`. Hoje nem modelamos isso.
2. **Padrão polling-com-deadline**: extrair `pollUntil(deadline, check, { intervalMs })` como utility.
3. **Provider abstraction**: Claude Code, Codex, Gemini, OpenCode são SKUs diferentes — session path, CLI, model flag. Hoje temos só Claude Code hard-coded.
4. **Approved workspaces**: não rodar Claude Code em CWD aleatório. Whitelist explícita.

## 6. Camada Terminal + PTY Host

```
contexts/terminal/presentation/main-ipc/
├── register.ts            ← ptySpawn, ptyWrite, ptyResize, ptyKill, ptyAttach
├── runtime.ts             ← interface PtyRuntime
├── sessionManager.ts
└── sessionStateWatcher*.ts
```

### Interface `PtyRuntime` (abstração plugável)

```typescript
interface PtyRuntime {
  spawnSession(opts: SpawnPtyOptions): Promise<{ sessionId: string }>
  write(sessionId, data, encoding): Promise<void>
  resize(sessionId, cols, rows): Promise<void>
  kill(sessionId): Promise<void>
  attach(rendererId, sessionId): Promise<void>
  snapshot(sessionId): Promise<TerminalSnapshot>
  startSessionStateWatcher(config): void
}
```

**Duas implementações:**
- `ElectronPtyRuntime` → delega pro ptyHost worker thread
- `HeadlessPtyRuntime` → roda inline no worker process (modo servidor)

### Eventos IPC (stream)

```
pty:data                  ← Buffer do PTY (async, não ACK)
pty:exit                  ← { sessionId, exitCode }
pty:state                 ← mudanças de state
pty:session-metadata
pty:sync-session-bindings
pty:snapshot              ← pra recovery/persist
```

### Scrollback persistido separado

Tabela **dedicada** pro scrollback (via `@xterm/addon-serialize`):

```typescript
nodeScrollback {
  nodeId, scrollback (JSON string), updatedAt
}
agentNodePlaceholderScrollback {
  nodeId, scrollback, updatedAt
}
```

**Insight:** scrollback não fica no node do canvas. É tabela separada, carregada sob demanda. Permite abrir canvas com 50 nodes sem travar.

### 📋 O que copiar pro agents-ui

1. **Interface `PtyRuntime`**: renderer não sabe se PTY roda em processo separado ou inline. Testabilidade alta.
2. **Write/data são fire-and-forget**; resize é sync. Nunca esperar ACK no write ou stream.
3. **Scrollback em tabela separada**: M1 simples → `terminal_scrollback(nodeId, json, updatedAt)`.
4. **Snapshot pra recovery**: ao abrir o app, restaurar buffer do último snapshot antes de reconectar PTY.

## 7. Canvas infinito (React Flow)

**Descoberta-chave: não tem canvas engine custom. É React Flow 12 + criatividade em nodes.**

```typescript
export const WorkspaceCanvas = () => (
  <ReactFlowProvider>
    <WorkspaceCanvasInner {...props} />
  </ReactFlowProvider>
)
```

### Hooks separados por preocupação

```typescript
useWorkspaceCanvasState()               // flow state + viewport
useWorkspaceCanvasNodesStore()          // CRUD de nodes
useWorkspaceCanvasNodeDragSession()     // drag
useWorkspaceCanvasSpaceDirectoryOps()   // bind de space a mount
useWorkspaceCanvasSpaces()              // space active/rename
useWorkspaceCanvasSpaceDrag()           // drag preview de space
```

**Insight:** em vez de um mega-componente com 1200 linhas, cada preocupação é um hook. Facilita teste e refactor.

### Tipos de node (schema.ts — coluna `kind`)

| Kind | Componente | O que é |
|---|---|---|
| `terminal` | TerminalNode | xterm.js + PTY shell |
| `agent` | AgentNode | terminal + watcher + UI resume |
| `task` | TaskNode | checklist, prioridade, status |
| `note` | NoteNode | markdown |
| `image` | ImageNode | desenho em canvas |

### Spaces

Agrupamento lógico de nodes por diretório. Persistido em `spaces` + `spaceNodes` (M2M). **Não há edges cross-space** — boundaries são organizacionais.

### 📋 O que copiar pro agents-ui

1. **`<ReactFlowProvider>` na raiz** + hooks granulares. Padrão direto.
2. **Kinds no DB, componentes React no renderer**. Adicionar kind = adicionar linha na tabela + registro no `nodeTypes`.
3. **JSON columns (`agentJson`, `taskJson`) no DB** pra extensibilidade sem migration.
4. **Spaces como organização, não containers físicos.**

## 8. Persistência

Stack: **better-sqlite3** (sync, rápido, Node-native) + **Drizzle ORM** + **PRAGMA user_version** pra migrations manuais.

### Schema resumido

```typescript
appMeta          // key-value (format_version, active_workspace_id, revision)
workspaces       // id, name, path, viewport, activeSpaceId, ...
nodes            // id, workspaceId, kind, pos, size, status, agentJson, taskJson, ...
spaces           // id, workspaceId, name, directoryPath, targetMountId, rect...
spaceNodes       // M2M spaces↔nodes
nodeScrollback   // id, scrollback JSON, updatedAt
agentNodePlaceholderScrollback
```

### Migration pattern (`docs/PERSISTENCE.md`)

Sem drizzle-kit em runtime. Manual:

```typescript
const DB_SCHEMA_VERSION = 7

async function migrate(db) {
  const current = db.pragma('user_version', { simple: true })
  if (current === DB_SCHEMA_VERSION) return

  // Backup antes de mexer
  fs.copyFileSync(dbPath, `${dbPath}.bak-${Date.now()}`)

  for (let v = current; v < DB_SCHEMA_VERSION; v++) {
    await applyMigration(db, v + 1)  // CREATE/ALTER/DATA transforms
  }

  db.pragma(`user_version = ${DB_SCHEMA_VERSION}`)
}
```

**Fallback de corrupção:** se `migrate()` jogar, renomeia `db.sqlite` → `db.sqlite.corrupt-<ts>` e cria vazia. Nunca perde dados (ficam no arquivo corrupt pra forense).

### IPC de persistência

```
persistence:read-workspace-state-raw
persistence:write-workspace-state-raw
persistence:read-app-state
persistence:write-app-state
persistence:read-node-scrollback
persistence:write-node-scrollback
```

### 📋 O que copiar pro agents-ui

1. **better-sqlite3 + Drizzle** → ganha persistência 100× mais robusta que `data/usage.json`.
2. **PRAGMA user_version + backup-on-upgrade** → migration simples, sem dependency.
3. **JSON columns pra estender sem ALTER**: `agentJson`, `taskJson`, `meta`.
4. **Separar chat scrollback do node principal** → abrir canvas rápido, scrollback lazy.

## 9. Filesystem com URI + guardrails

```typescript
interface FileSystemPort {
  readFileText(uri: string): Promise<string>
  writeFileText(uri, content): Promise<void>
  readDirectory(uri): Promise<Entry[]>
  stat(uri): Promise<FileStat>
  createDirectory(uri): Promise<void>
}

// Guardrail obrigatório
const approved = await approvedWorkspaces.isPathApproved(cwd)
if (!approved) throw createAppError('common.approved_path_required')
```

**URI-first:** nunca `string path` crua no IPC. Sempre `file:///Users/...`.

### IPC channels

```
filesystem:read-file-text
filesystem:write-file-text
filesystem:read-directory
filesystem:stat
filesystem:create-directory
filesystem:copy-entry
filesystem:move-entry
filesystem:rename-entry
filesystem:delete-entry
```

### 📋 O que copiar pro agents-ui

1. **URI scheme** sempre. Normalizar antes de passar pro FS port.
2. **ApprovedWorkspaceStore** → whitelist explícita. Sem isso, um agente malicioso pode escrever em `C:\Windows\System32`.

## 10. IPC: padrão typed + Zod + Result

### 1. Channels tipados (`shared/contracts/ipc/channels.ts`)

```typescript
export const IPC_CHANNELS = {
  agentLaunch:                'agent:launch',
  agentListModels:            'agent:list-models',
  agentListInstalledProviders:'agent:list-installed-providers',
  agentResolveResumeSession:  'agent:resolve-resume-session',
  ptySpawn:                   'pty:spawn',
  ptyWrite:                   'pty:write',
  persistenceWriteAppState:   'persistence:write-app-state',
  // ... 99 canais total
} as const
```

### 2. Handler com wrapper `registerHandledIpc`

```typescript
registerHandledIpc(
  IPC_CHANNELS.agentListInstalledProviders,
  async (): Promise<ListInstalledAgentProvidersResult> => ({
    providers: await listInstalledAgentProviders(),
  }),
  { defaultErrorCode: 'common.unexpected' },
)
```

Wrapper faz: invoke handler → catch error → mapeia pra `AppErrorDescriptor { code, message, debugInfo }` → retorna `{ ok, value|error }`.

### 3. Validação Zod no boundary

```typescript
export function normalizeLaunchAgentPayload(payload: unknown): LaunchAgentInput {
  return z.object({
    provider: z.enum(['claude-code', 'codex', 'opencode', 'gemini']),
    cwd: z.string().min(1),
    prompt: z.string().optional(),
    model: z.string().optional().nullable(),
    cols: z.number().optional(),
    rows: z.number().optional(),
  }).parse(payload)  // throws se inválido → wrapper pega e retorna error
}
```

### 4. Renderer invoca via preload

```typescript
// preload/ipcInvoke.ts
async function invokeIpc<T>(channel, payload?): Promise<T> {
  const result = await ipcRenderer.invoke(channel, payload)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

// Uso em componente
const r = await window.opencoveApi.agent.launch(input)
```

### 5. Equivalente HTTP no worker

```http
POST /invoke
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "agent.launch",
  "params": { "provider": "claude-code", "cwd": "...", ... },
  "protocolVersion": 1
}

→

{ "ok": true, "value": {...}, "now": "2026-04-19T...", "pid": 1234 }
```

### 📋 O que copiar pro agents-ui

1. **Channels como `const` tipado**. Autocomplete + refactor-safe.
2. **Wrapper `registerHandledIpc`** → erro sempre normalizado.
3. **Zod em toda entrada untrusted**. Sem excepciones.
4. **Result type `{ ok, value|error }`** em vez de exceptions. UI pode pattern-match em `error.code`.
5. **Preload é só mapping**. Zero lógica.

## 11. CLI externo

`src/app/cli/opencove.mjs` é um **thin CLI wrapper** que fala com o Control Surface:

```bash
opencove worker start --port 16661 --token xyz   # sobe worker
opencove agent-launch --provider claude-code \
  --cwd /path --prompt "refatore X"              # dispara agente
opencove ping --endpoint http://127.0.0.1:16661  # healthcheck
```

Internamente:
```typescript
const result = await invokeControlSurface(endpoint, {
  id: command,              // 'agent.launch'
  params: { ... },
  protocolVersion: 1,
}, token)
console.log(JSON.stringify(result, null, pretty ? 2 : 0))
```

### 📋 O que copiar pro agents-ui

CLI vira **driver do backend**. Dá pra scriptar sem abrir UI. Exemplo pro agents-ui: `agents-ui run --agent nycolas --prompt "copy IMC lote 2"`.

## 12. i18n

`src/app/renderer/i18n/locales/en.ts` monta tudo por composição:

```typescript
import { enMessages } from './en.messages'
import { enShell } from './en.shell'
import { enSpaceExplorer } from './en.spaceExplorer'
import { enSettingsPanel } from './en.settingsPanel'
import { enWorktree } from './en.worktree'
import { enWebsiteNode } from './en.websiteNode'

export const en = {
  common: { add, cancel, close, ... },
  taskPriorities: { low, medium, high, urgent },
  taskStatuses: { todo, doing, aiDone, done },
  sidebar: { projects, agents, terminals, ... },
  appHeader: { toggleSidebar, commandCenter, ... },
  // ... aninhado ~5 níveis
}

export const zh_CN = { /* mesma estrutura */ }
```

Uso:
```typescript
const { t } = useTranslation()
<button>{t('common.cancel')}</button>
```

### 📋 O que copiar pro agents-ui

Se algum dia internacionalizar: `en.ts` + `pt-BR.ts` com **mesma estrutura aninhada por feature**.

## 13. Segurança Electron

Do `DEVELOPMENT.md:152-156` e `electron.vite.config.ts:7-29`:

| Regra | Por quê |
|---|---|
| `contextIsolation: true` SEMPRE | Sem isso, renderer acessa Node direto → RCE via qualquer lib de markdown/MDX. |
| `nodeIntegration: false` | Idem. |
| Validar **todo** input IPC com Zod | Renderer não é trusted — extensions/scripts podem mandar lixo. |
| CSP explícito via plugin Vite | `opencoveCspPlugin()` em `electron.vite.config.ts:31-53`. |
| `style-src 'unsafe-inline'` **só em dev** | Prod proíbe inline style → evita XSS via CSS injection. |
| `sandbox: true` no BrowserWindow | Segunda camada de isolamento. |
| Cleanup pareado de recursos | Listeners/watchers/child procs precisam ser removidos — senão leak. |

## 14. Roadmap sugerido pro agents-ui

### Fase 0 — Preparar o terreno (sem migrar ainda)

Ganhos sem mexer em Electron:

- [ ] Substituir `data/usage.json` + localStorage por **SQLite local via `better-sqlite3`** no Express. Schema minimal: `agents`, `sessions`, `messages`, `usage`.
- [ ] Separar `server/index.js` em `contexts/` — `agent/`, `session/`, `usage/`, `settings/`. Mesmo que monolítico, já desacopla.
- [ ] Adicionar **React Flow** em `src/views/Canvas.jsx` como rota `/canvas`. Começa com `ChatNode` só.
- [ ] Introduzir **Zod** nos endpoints Express pra validação (treino pro IPC futuro).

### Fase 1 — Migração Electron

- [ ] Trocar `vite.config.js` por **`electron.vite.config.ts`** (template copiado do OpenCove).
- [ ] Criar `src/app/main/index.ts`, `src/app/preload/index.ts`, manter `src/app/renderer/` com o código atual.
- [ ] `contextBridge.exposeInMainWorld('agentsUiApi', {...})` replicando os endpoints Express atuais.
- [ ] Spawn do `claude` CLI migra pra **ptyHost worker thread** com `node-pty` → ganhamos stream real (mata a animação fake de 6 chars/8ms).
- [ ] Empacotar com **electron-builder** publicando no GitHub Releases.

### Fase 2 — Paridade com OpenCove/Maestri

- [ ] **Worker HTTP local** (Control Surface) → acesso via celular na LAN.
- [ ] Canvas infinito com nodes: `AgentTerminalNode`, `ChatNode`, `TaskNode`, `NoteNode`.
- [ ] Scrollback persistido separado (`terminal_scrollback` table).
- [ ] ApprovedWorkspaceStore → whitelist de CWDs antes de spawn.
- [ ] Session resumption via polling em `~/.claude/projects/`.

### Fase 3 — Killer feature (não existe em OSS ainda)

- [ ] **PTY-to-PTY via edge visual**: conectar dois AgentNodes com linha → agente A digita no terminal do agente B (delega tarefa). Esse é o diferencial do Maestri; OpenCove ainda não tem completo.

## 15. Referências

- **Repo OpenCove:** https://github.com/DeadWaveWave/opencove
- **Release nightly testada:** v0.2.0-nightly.20260419.1
- **Clone local (análise):** `F:/claude-projetos/tmp/opencove-source/`
- **Docs internas do repo (chinês, mas com código copiável):**
  - `DEVELOPMENT.md` — princípios + checklist de segurança
  - `AGENTS.md` — regras pros agentes de IA contribuindo
  - `docs/ARCHITECTURE.md` — DDD + Clean detalhado
  - `docs/CONTROL_SURFACE.md` — padrão command/query/event
  - `docs/PERSISTENCE.md` — schema + migrations
  - `docs/FILESYSTEM.md` — URI + providers
  - `docs/RECOVERY_MODEL.md` — estados e ownership
  - `docs/TERMINAL_TUI_RENDERING_BASELINE.md`
- **Libs-chave (todas MIT ou Apache):**
  - electron-vite: https://electron-vite.org/
  - React Flow: https://reactflow.dev/
  - xterm.js: https://xtermjs.org/
  - node-pty: https://github.com/microsoft/node-pty
  - Drizzle ORM: https://orm.drizzle.team/
  - better-sqlite3: https://github.com/WiseLibs/better-sqlite3
  - Zustand: https://github.com/pmndrs/zustand
