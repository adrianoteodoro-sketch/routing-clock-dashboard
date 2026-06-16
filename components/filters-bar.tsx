"use client"

import { Filter } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DashboardOpcoes, Filters } from "@/lib/types"

interface FiltersBarProps {
  filters: Filters
  opcoes: DashboardOpcoes
  onChange: (next: Partial<Filters>) => void
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
  highlight,
}: {
  label: string
  value: string
  allLabel: string
  options: string[]
  onChange: (v: string) => void
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={`text-xs font-bold uppercase tracking-wide ${highlight ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="min-w-[130px] font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allLabel}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DateRangeFilter({
  label,
  inicio,
  fim,
  onInicio,
  onFim,
}: {
  label: string
  inicio: string
  fim: string
  onInicio: (v: string) => void
  onFim: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={inicio}
          onChange={(e) => onInicio(e.target.value)}
          aria-label={`${label} - data inicial`}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs font-medium text-muted-foreground">até</span>
        <input
          type="date"
          value={fim}
          onChange={(e) => onFim(e.target.value)}
          aria-label={`${label} - data final`}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}

export function FiltersBar({ filters, opcoes, onChange }: FiltersBarProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Filter className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold uppercase tracking-tight text-foreground">Contexto da Análise</h2>
            <p className="text-sm text-muted-foreground">Selecione os filtros para visualizar os resultados</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <FilterSelect
            label="Regional"
            value={filters.regional}
            allLabel="TODAS"
            options={opcoes.regionais}
            onChange={(v) => onChange({ regional: v })}
            highlight
          />
          <FilterSelect
            label="HUB"
            value={filters.hub}
            allLabel="TODOS"
            options={opcoes.hubs}
            onChange={(v) => onChange({ hub: v })}
            highlight
          />
          <FilterSelect
            label="Mês"
            value={filters.mes}
            allLabel="TODOS"
            options={opcoes.meses}
            onChange={(v) => onChange({ mes: v })}
          />
          <FilterSelect
            label="Semana"
            value={filters.semana}
            allLabel="TODAS"
            options={opcoes.semanas}
            onChange={(v) => onChange({ semana: v })}
          />
          <DateRangeFilter
            label="Data Roteirização"
            inicio={filters.rotInicio}
            fim={filters.rotFim}
            onInicio={(v) => onChange({ rotInicio: v })}
            onFim={(v) => onChange({ rotFim: v })}
          />
          <DateRangeFilter
            label="Data Coleta"
            inicio={filters.coletaInicio}
            fim={filters.coletaFim}
            onInicio={(v) => onChange({ coletaInicio: v })}
            onFim={(v) => onChange({ coletaFim: v })}
          />
        </div>
      </div>
    </div>
  )
}
