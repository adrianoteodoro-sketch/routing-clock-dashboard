"use client"

import { AlertCircle, Clock } from "lucide-react"
import type { Ofensor, RangeSeveridade } from "@/lib/types"

export function OffendersList({ ofensores }: { ofensores: Ofensor[] }) {
  const max = Math.max(...ofensores.map((o) => o.ocorrencias), 1)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold uppercase tracking-tight text-foreground">Maiores Ofensores</h3>
          <p className="text-sm text-muted-foreground">Facilities com mais não aderências</p>
        </div>
      </div>

      {ofensores.length === 0 ? (
        <p className="py-10 text-center text-sm italic text-muted-foreground">Nenhuma não aderência registrada</p>
      ) : (
        <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {ofensores.map((o) => (
            <div key={o.facilityId} className="rounded-xl border border-border bg-secondary/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{o.facilityId}</p>
                  <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">{o.reason}</p>
                </div>
                <span className="shrink-0 text-lg font-bold text-danger">{o.ocorrencias}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-danger" style={{ width: `${(o.ocorrencias / max) * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{o.pctImpacto.toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SEV_LABEL: Record<RangeSeveridade["severidade"], { text: string; cls: string }> = {
  baixa: { text: "Baixa", cls: "bg-success/10 text-success" },
  media: { text: "Média", cls: "bg-warning/15 text-warning" },
  alta: { text: "Alta", cls: "bg-danger/10 text-danger" },
}

export function SeverityRange({ ranges }: { ranges: RangeSeveridade[] }) {
  const max = Math.max(...ranges.map((r) => r.ocorrencias), 1)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold uppercase tracking-tight text-foreground">Range de Estouro de TMR</h3>
          <p className="text-sm text-muted-foreground">Por severidade do atraso</p>
        </div>
      </div>

      {ranges.length === 0 ? (
        <p className="py-10 text-center text-sm italic text-muted-foreground">Nenhum estouro registrado</p>
      ) : (
        <div className="flex flex-col gap-4">
          {ranges.map((r) => {
            const sev = SEV_LABEL[r.severidade]
            return (
              <div key={r.faixa}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{r.faixa}</span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sev.cls}`}>{sev.text}</span>
                    <span className="text-sm font-bold text-foreground">{r.ocorrencias}</span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${
                      r.severidade === "alta" ? "bg-danger" : r.severidade === "media" ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${(r.ocorrencias / max) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 rounded-xl bg-primary/5 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Análise de Severidade</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Foque nos ranges de maior duração para reduzir o risco de estouro de TMR e o impacto no prazo de coleta.
        </p>
      </div>
    </div>
  )
}
