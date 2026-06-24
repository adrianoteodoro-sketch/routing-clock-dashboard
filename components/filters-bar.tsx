"use client"

import { Filter, PanelLeftClose, PanelLeftOpen, RotateCcw } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DashboardOpcoes, Filters } from "@/lib/types"

interface FiltersBarProps {
  filters: Filters
  opcoes: DashboardOpcoes
  onChange: (next: Partial<Filters>) => void
  collapsed: boolean
  onToggle: () => void
  onReset?: () => void
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
    <div className="flex flex-col gap-1">
      <label
        className={`text-[11px] font-semibold uppercase tracking-wide ${highlight ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 w-full px-2.5 py-1 text-xs font-medium [&>svg]:h-3.5 [&>svg]:w-3.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allLabel} className="text-xs">
            {allLabel}
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-xs">
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="flex flex-col gap-1">
        <input
          type="date"
          value={inicio}
          onChange={(e) => onInicio(e.target.value)}
          aria-label={`${label} - data inicial`}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-center text-[11px] font-medium text-muted-foreground">até</span>
        <input
          type="date"
          value={fim}
          onChange={(e) => onFim(e.target.value)}
          aria-label={`${label} - data final`}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}

export function FiltersBar({ filters, opcoes, onChange, collapsed, onToggle, onReset }: FiltersBarProps) {
  // Quando recolhida, mostra apenas uma faixa fina e discreta com o botão de abrir.
  if (collapsed) {
    return (
      <aside className="flex shrink-0 flex-col items-center gap-2 self-start">
        <button
          onClick={onToggle}
          aria-label="Abrir filtros"
          title="Abrir filtros"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 rounded-xl border border-border bg-card/60 p-4 lg:w-64">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="h-4 w-4" />
          <h2 className="text-xs font-bold uppercase tracking-wide">Filtros</h2>
        </div>
        <button
          onClick={onToggle}
          aria-label="Recolher filtros"
          title="Recolher filtros"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
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
        <FilterSelect
          label="Tipo Roteirização"
          value={filters.tipo}
          allLabel="TODOS"
          options={["D-1", "D-2", "W-1"]}
          onChange={(v) => onChange({ tipo: v })}
          highlight
        />
        <DateRangeFilter
          label="Data Roteirização"
          inicio={filters.rotInicio}
          fim={filters.rotFim}
          onInicio={(v) => onChange({ rotInicio: v })}
          onFim={(v) => onChange({ rotFim: v })}
        />
      </div>

      {onReset && (
        <button
          onClick={onReset}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
