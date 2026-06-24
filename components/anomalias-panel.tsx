"use client"

import { AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react"
import type { AnomaliasResumo } from "@/lib/types"

export function AnomaliasPanel({ data }: { data: AnomaliasResumo }) {
  const { total, comAtraso, semAtraso, categorias } = data

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Anomalias da Roteirização</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Problemas registrados no período — base para planos de ação
      </p>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma anomalia registrada para o período/filtro selecionado.
          </p>
        </div>
      ) : (
        <>
          {/* Totais: com atraso (afetou performance) x sem atraso */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center rounded-xl bg-secondary/40 px-2 py-3 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">{total}</span>
            </div>
            <div className="flex flex-col items-center rounded-xl bg-danger/10 px-2 py-3 text-center">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-danger">
                <AlertTriangle className="h-3.5 w-3.5" /> Com atraso
              </span>
              <span className="text-2xl font-bold tracking-tight text-danger">{comAtraso}</span>
            </div>
            <div className="flex flex-col items-center rounded-xl bg-success/10 px-2 py-3 text-center">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sem atraso
              </span>
              <span className="text-2xl font-bold tracking-tight text-success">{semAtraso}</span>
            </div>
          </div>

          {/* Quebra por categoria de problema */}
          <div className="mt-5 flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Por tipo de problema
            </span>
            {categorias.map((c) => {
              const pctAtraso = c.total > 0 ? (c.comAtraso / c.total) * 100 : 0
              return (
                <div key={c.problema} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium leading-snug text-foreground">{c.problema}</span>
                    <span className="shrink-0 text-sm font-bold text-foreground">{c.total}</span>
                  </div>
                  {/* Barra empilhada: vermelho (com atraso) + verde (sem atraso) */}
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="bg-danger" style={{ width: `${pctAtraso}%` }} aria-hidden />
                    <div className="bg-success" style={{ width: `${100 - pctAtraso}%` }} aria-hidden />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-danger" aria-hidden />
                      {c.comAtraso} com atraso
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-success" aria-hidden />
                      {c.semAtraso} sem atraso
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
