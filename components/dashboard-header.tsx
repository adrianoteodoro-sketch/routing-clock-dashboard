"use client"

import { LayoutGrid, RefreshCw, Package } from "lucide-react"

interface DashboardHeaderProps {
  onRefresh: () => void
  refreshing: boolean
  lastUpdated: Date | null
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function DashboardHeader({ onRefresh, refreshing, lastUpdated }: DashboardHeaderProps) {
  return (
    <>
      {/* Barra de marca Mercado Livre */}
      <div className="w-full bg-brand-yellow">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-foreground" strokeWidth={2.2} />
            <span className="text-xl font-bold tracking-tight text-foreground">Mercado Livre</span>
          </div>
        </div>
      </div>

      {/* Título do dashboard */}
      <div className="w-full border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-1 rounded-full bg-primary" aria-hidden />
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <LayoutGrid className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                  ROUTING CLOCK <span className="text-primary">FIRST MILE</span>
                </h1>
                <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Análise de Performance de Roteirização
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 self-start rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-60 sm:self-auto"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar Dados
            </button>
            <p className="text-xs text-muted-foreground">
              {refreshing
                ? "Atualizando..."
                : lastUpdated
                  ? `Última atualização: ${formatTimestamp(lastUpdated)}`
                  : "Aguardando dados..."}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
