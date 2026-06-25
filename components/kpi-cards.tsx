"use client"

import { TrendingUp, TrendingDown, Package, Target, CalendarDays } from "lucide-react"
import type { Kpis, PerfPorTipo, DiaRoteirizado } from "@/lib/types"

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR")
}

// 1 casa decimal, mas sem ".0" quando for número inteiro. Ex.: 96.8 -> "96.8", 100 -> "100".
function formatDecimal(n: number | undefined | null): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—"
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function variation(current: number, previous: number): { text: string; positive: boolean } {
  if (previous === 0) return { text: "—", positive: true }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const positive = pct >= 0
  return { text: `${positive ? "+" : ""}${formatDecimal(pct)}% vs sem. anterior`, positive }
}

// Cor do badge por tipo de roteirização (consistente com o resto do dash).
const TIPO_BADGE: Record<string, string> = {
  "W-1": "bg-primary/10 text-primary",
  "D-1": "bg-warning/15 text-warning",
  "D-2": "bg-danger/10 text-danger",
}

export function KpiCards({
  kpis,
  porTipo = [],
  diasRoteirizados = [],
}: {
  kpis: Kpis
  porTipo?: PerfPorTipo[]
  diasRoteirizados?: DiaRoteirizado[]
}) {
  const perfVar = variation(kpis.perfUltimaSemana, kpis.perfSemanaAnterior)
  const volVar = variation(kpis.volumeUltimaSemana, kpis.volumeSemanaAnterior)
  const delta = kpis.performanceAtual - kpis.meta
  const deltaPositive = delta >= 0

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {/* Performance atual */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              perfVar.positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {perfVar.text}
          </span>
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Routing Clock XD</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">
          {formatDecimal(kpis.performanceAtual)}%
        </p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(kpis.performanceAtual, 100)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">Meta</span>
          <span className="font-bold text-foreground">{formatDecimal(kpis.meta)}%</span>
        </div>

        {porTipo.length > 0 && (
          <div className="mt-4 grid gap-2 border-t border-border pt-4" style={{ gridTemplateColumns: `repeat(${porTipo.length}, minmax(0, 1fr))` }}>
            {porTipo.map((t) => {
              const ok = t.performance >= t.meta
              return (
                <div key={t.tipo} className="flex flex-col items-center rounded-lg bg-secondary/40 px-2 py-2 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t.tipo}</span>
                  <span className={`text-lg font-bold tracking-tight ${ok ? "text-success" : "text-danger"}`}>
                    {formatDecimal(t.performance)}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatNumber(t.volume)} rot.</span>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Delta vs Meta */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${
              deltaPositive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
            }`}
          >
            {deltaPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              deltaPositive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {deltaPositive ? "Acima da meta" : "Abaixo da meta"}
          </span>
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delta vs Meta</p>
        <p
          className={`mt-1 text-4xl font-bold tracking-tight ${deltaPositive ? "text-success" : "text-danger"}`}
        >
          {deltaPositive ? "+" : ""}
          {formatDecimal(delta)} p.p.
        </p>
      </div>

      {/* Dias Roteirizados */}
      {diasRoteirizados.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dias Roteirizados</p>
          <div className="mt-4 flex flex-col gap-2">
            {["W-1", "D-1", "D-2"].map((tipo) => {
              // Exibe todas as combinações roteirizadas, inclusive fora da meta e zeradas (0%).
              const dias = diasRoteirizados.filter((d) => d.tipo === tipo)
              if (dias.length === 0) return null
              return (
                <div key={tipo} className="flex flex-wrap items-center gap-1.5">
                  {dias.map((d) => {
                    const hasPerf = typeof d.performance === "number" && !Number.isNaN(d.performance)
                    const ok = hasPerf && d.performance >= (d.meta ?? 0)
                    return (
                      <span
                        key={`${d.tipo}-${d.diaSemana}`}
                        title={`${formatNumber(d.volume)} roteiros · meta ${formatDecimal(d.meta)}%`}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                          TIPO_BADGE[d.tipo] ?? "bg-secondary text-foreground"
                        }`}
                      >
                        {d.tipo} {d.diaSemana}
                        {hasPerf && (
                          <span className={`text-[11px] font-bold ${ok ? "text-success" : "text-danger"}`}>
                            {formatDecimal(d.performance)}%
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Volume total */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <Package className="h-5 w-5" />
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              volVar.positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            }`}
          >
            {volVar.text}
          </span>
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Total de Roteiros
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">{formatNumber(kpis.volumeTotal)}</p>
      </div>
    </div>
  )
}
