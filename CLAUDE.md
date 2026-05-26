# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Web UI for interacting with Claude Code agents defined in the parent repository (`../skills/`). The backend spawns the `claude` CLI as a subprocess — no Anthropic API key needed, uses OAuth from the Claude Code installation.

## Commands

```bash
npm install          # install dependencies
npm run dev:all      # start both Vite (5174) + Express (3003) — recommended
npm run dev          # Vite frontend only
npm run dev:server   # Express backend only (nodemon)
npm run build        # production build of frontend

# PM2 (production)
npm run start        # pm2 start via ecosystem.config.cjs
npm run stop
npm run restart
npm run logs
```

## Architecture

```
Browser (React) → POST /api/chat → Express → spawn('claude', ['-p', '--output-format', 'json'])
```

- **Frontend**: React + Vite on port 5174. Vite proxies `/api/*` → `localhost:3003`.
- **Backend**: Express on port 3003 (`server/index.js`). Single file — all routes and agent config here.
- **No streaming**: The CLI call is synchronous. `api.js` simulates typing animation (6 chars/8ms) client-side after the full response arrives.
- **State**: Chat history lives in `localStorage` only (keys `agents-ui-chats`, `agents-ui-agent-chats`). No database.
- **Usage log**: Each request is appended to `data/usage.json` (last 1000 entries). Read by `GET /api/dashboard`.

## Critical env vars in child process

`server/index.js` deletes two env vars before spawning `claude`:
- `CLAUDECODE` — without deletion, CLI refuses to run inside another Claude Code session
- `ANTHROPIC_API_KEY` — without deletion, CLI uses the key (may have zero credits) instead of OAuth

## Adding a new agent

1. Create a `.md` skill file in `../skills/` or `../.claude/agents/`
2. Add a config entry in `buildAgentConfig()` in `server/index.js`
3. Add the agent ID to the array in `GET /api/agents`
4. Optionally add a welcome message in `ChatWindow.jsx` (`welcomes` object)

## Key file locations

| File | Purpose |
|------|---------|
| `server/index.js` | All backend logic: agent configs, CLI spawning, usage tracking |
| `src/App.jsx` | Root state: agents list, chat persistence, view routing |
| `src/components/ChatWindow.jsx` | Message rendering, image upload, send logic |
| `src/components/Sidebar.jsx` | Agent selector, chat history list |
| `src/components/Dashboard.jsx` | Usage stats view |
| `src/lib/api.js` | `streamChat()`, `fetchAgents()`, `fetchDashboard()` |
| `data/usage.json` | Auto-created at runtime, not committed |

## Skill files path

`SKILLS_PATH` env var overrides the default, which resolves to `../../skills` relative to `server/`. The Alex Hormozi agent reads from `../../.claude/agents/alex-hormozi.md` and strips YAML frontmatter automatically.
