"use client"

import { TrendingUp, TrendingDown, Package, Target } from "lucide-react"
import type { Kpis } from "@/lib/types"

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR")
}

// 1 casa decimal, mas sem ".0" quando for número inteiro. Ex.: 96.8 -> "96.8", 100 -> "100".
function formatDecimal(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function variation(current: number, previous: number): { text: string; positive: boolean } {
  if (previous === 0) return { text: "—", positive: true }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const positive = pct >= 0
  return { text: `${positive ? "+" : ""}${formatDecimal(pct)}% vs sem. anterior`, positive }
}

export function KpiCards({ kpis }: { kpis: Kpis }) {
  const perfVar = variation(kpis.perfUltimaSemana, kpis.perfSemanaAnterior)
  const volVar = variation(kpis.volumeUltimaSemana, kpis.volumeSemanaAnterior)
  const delta = kpis.performanceAtual - kpis.meta
  const deltaPositive = delta >= 0

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
