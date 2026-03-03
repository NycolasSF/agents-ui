import { useEffect, useState } from 'react'
import { fetchDashboard } from '../lib/api.js'
import { Loader2, RefreshCw } from 'lucide-react'

const AGENT_LABELS = {
  vendedor: { name: 'Vendedor', icon: '🎯' },
  lancamento: { name: 'Lançamento', icon: '🚀' },
  concorrentes: { name: 'Concorrentes', icon: '🔍' },
  hormozi: { name: 'Alex Hormozi', icon: '💰' },
  livre: { name: 'Chat Livre', icon: '💬' },
}

function fmt(n, decimals = 2) {
  return Number(n || 0).toFixed(decimals)
}

function fmtK(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n || 0)
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchDashboard()
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(load, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[#55556a]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  const ui = data?.agentsUi || {}
  const cc = data?.claudeCode || null

  // Totais
  const totalCost = (ui.recent || []).reduce((s, r) => s + (r.costUSD || 0), 0)
  const totalTokens = (ui.recent || []).reduce((s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0), 0)

  // Dias para gráfico (últimos 14)
  const dayEntries = Object.entries(ui.byDay || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
  const maxCostDay = Math.max(...dayEntries.map(([, v]) => v.costUSD || 0), 0.0001)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e8e8f0]">Dashboard de uso</h2>
            <p className="text-xs text-[#55556a] mt-0.5">Consumo dos agentes e Claude Code</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 text-xs text-[#55556a] hover:text-[#8888a0] px-3 py-2 rounded-lg hover:bg-[#12121a] transition-colors"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>

        {/* Cards resumo — agents-ui */}
        <section>
          <h3 className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-3">Agents UI</h3>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Mensagens enviadas" value={ui.totalRequests || 0} />
            <Card label="Tokens totais" value={fmtK(totalTokens)} />
            <Card label="Custo estimado" value={`$${fmt(totalCost, 4)}`} highlight />
          </div>
        </section>

        {/* Por agente */}
        {Object.keys(ui.byAgent || {}).length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-3">Por agente</h3>
            <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-2.5 text-xs text-[#55556a] font-medium">Agente</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Msgs</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Tokens in</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Tokens out</th>
                    <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Custo USD</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ui.byAgent).map(([agentId, stats]) => {
                    const meta = AGENT_LABELS[agentId] || { name: agentId, icon: '🤖' }
                    return (
                      <tr key={agentId} className="border-b border-[#1e1e2e] last:border-0 hover:bg-[#12121a]">
                        <td className="px-4 py-2.5 text-[#c8c8d8]">
                          <span className="mr-2">{meta.icon}</span>{meta.name}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{stats.messages}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(stats.inputTokens)}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(stats.outputTokens)}</td>
                        <td className="px-4 py-2.5 text-right text-[#a78bfa]">${fmt(stats.costUSD, 4)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Gráfico de custo por dia */}
        {dayEntries.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-3">Custo por dia (últimos 14 dias)</h3>
            <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4">
              <div className="flex items-end gap-1.5 h-24">
                {dayEntries.map(([day, v]) => {
                  const pct = ((v.costUSD || 0) / maxCostDay) * 100
                  const shortDay = day.slice(5) // MM-DD
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1 group" title={`${day}: $${fmt(v.costUSD, 4)} · ${v.messages} msgs`}>
                      <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                        <div
                          className="w-full rounded-t-sm bg-[#7c3aed] group-hover:bg-[#a78bfa] transition-colors"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#55556a] rotate-45 origin-left translate-x-1 translate-y-1 hidden sm:block">
                        {shortDay}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Claude Code stats */}
        {cc && (
          <section>
            <h3 className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-3">Claude Code — uso global</h3>
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total de sessões" value={cc.totalSessions || '—'} />
              <Card label="Total de mensagens" value={fmtK(cc.totalMessages)} />
              <Card label="Custo total" value={cc.totalCostUSD ? `$${fmt(cc.totalCostUSD, 2)}` : '—'} highlight />
            </div>

            {/* Tokens por modelo */}
            {cc.modelUsage && Object.keys(cc.modelUsage).length > 0 && (
              <div className="mt-3 bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      <th className="text-left px-4 py-2.5 text-xs text-[#55556a] font-medium">Modelo</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Input</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Output</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Cache read</th>
                      <th className="text-right px-4 py-2.5 text-xs text-[#55556a] font-medium">Cache write</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cc.modelUsage).map(([model, mu]) => (
                      <tr key={model} className="border-b border-[#1e1e2e] last:border-0 hover:bg-[#12121a]">
                        <td className="px-4 py-2.5 text-[#c8c8d8] font-mono text-xs">{model}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(mu.inputTokens)}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(mu.outputTokens)}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(mu.cacheReadInputTokens)}</td>
                        <td className="px-4 py-2.5 text-right text-[#8888a0]">{fmtK(mu.cacheCreationInputTokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Requisições recentes */}
        {(ui.recent || []).length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-[#55556a] uppercase tracking-wide mb-3">Requisições recentes</h3>
            <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-2.5 text-[#55556a] font-medium">Hora</th>
                    <th className="text-left px-4 py-2.5 text-[#55556a] font-medium">Agente</th>
                    <th className="text-right px-4 py-2.5 text-[#55556a] font-medium">Tokens</th>
                    <th className="text-right px-4 py-2.5 text-[#55556a] font-medium">Custo</th>
                    <th className="text-right px-4 py-2.5 text-[#55556a] font-medium">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {(ui.recent || []).map((r, i) => {
                    const meta = AGENT_LABELS[r.agentId] || { icon: '🤖' }
                    const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
                    return (
                      <tr key={i} className="border-b border-[#1e1e2e] last:border-0 hover:bg-[#12121a]">
                        <td className="px-4 py-2 text-[#55556a]">{time}</td>
                        <td className="px-4 py-2 text-[#8888a0]">{meta.icon} {r.agentId}</td>
                        <td className="px-4 py-2 text-right text-[#8888a0]">{fmtK((r.inputTokens || 0) + (r.outputTokens || 0))}</td>
                        <td className="px-4 py-2 text-right text-[#a78bfa]">${fmt(r.costUSD, 4)}</td>
                        <td className="px-4 py-2 text-right text-[#55556a]">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Estado vazio */}
        {!ui.totalRequests && (
          <div className="text-center py-12 text-[#55556a] text-sm">
            Nenhuma mensagem enviada ainda. Comece uma conversa com um agente.
          </div>
        )}

      </div>
    </div>
  )
}

function Card({ label, value, highlight }) {
  return (
    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl px-4 py-3">
      <p className="text-xs text-[#55556a] mb-1">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-[#a78bfa]' : 'text-[#e8e8f0]'}`}>
        {value}
      </p>
    </div>
  )
}
