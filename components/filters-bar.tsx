"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronUp, Filter, PanelLeftClose, PanelLeftOpen, RotateCcw } from "lucide-react"
import type { DashboardOpcoes, Filters } from "@/lib/types"

interface FiltersBarProps {
  filters: Filters
  opcoes: DashboardOpcoes
  onChange: (next: Partial<Filters>) => void
  collapsed: boolean
  onToggle: () => void
  onReset?: () => void
}

/** Converte o valor do filtro (allLabel, "" ou "A,B") em lista de selecionados. */
function parseSelected(value: string, allLabel: string): string[] {
  if (!value || value === allLabel) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Filtro de múltipla escolha: dropdown com checkboxes. O valor é armazenado como
 * allLabel (tudo) ou uma lista separada por vírgula. Fecha ao clicar fora.
 */
function MultiSelectFilter({
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = parseSelected(value, allLabel)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  function emit(next: string[]) {
    // Sem seleção ou todas as opções marcadas => "tudo" (allLabel).
    if (next.length === 0 || next.length === options.length) {
      onChange(allLabel)
      return
    }
    onChange(next.join(","))
  }

  function toggle(option: string) {
    if (selected.includes(option)) {
      emit(selected.filter((s) => s !== option))
    } else {
      emit([...selected, option])
    }
  }

  const triggerLabel =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selecionados`

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label
        className={`text-[11px] font-semibold uppercase tracking-wide ${highlight ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                onChange(allLabel)
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-secondary/60"
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {selected.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
              {allLabel}
            </button>
            {options.map((o) => {
              const checked = selected.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-secondary/60"
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {o}
                </button>
              )
            })}
          </div>
        )}
      </div>
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
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={inicio}
          onChange={(e) => onInicio(e.target.value)}
          aria-label={`${label} - data inicial`}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">até</span>
        <input
          type="date"
          value={fim}
          onChange={(e) => onFim(e.target.value)}
          aria-label={`${label} - data final`}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}

/**
 * Barra de filtros HORIZONTAL, exibida no topo do conteúdo de cada aba.
 * Mostra todos os filtros lado a lado (com quebra de linha em telas menores).
 */
export function FiltersTopBar({
  filters,
  opcoes,
  onChange,
  onReset,
}: {
  filters: Filters
  opcoes: DashboardOpcoes
  onChange: (next: Partial<Filters>) => void
  onReset?: () => void
}) {
  const [collapsed, setCollapsed] = useState(true)

  // Conta filtros ativos para sinalizar quando o painel está recolhido.
  const activeCount = [
    parseSelected(filters.hub, "TODOS").length > 0,
    parseSelected(filters.regional, "TODAS").length > 0,
    parseSelected(filters.tipo, "TODOS").length > 0,
    parseSelected(filters.mes, "TODOS").length > 0,
    parseSelected(filters.semana, "TODAS").length > 0,
    !!filters.roteirizacaoInicio || !!filters.roteirizacaoFim,
    !!filters.rotInicio || !!filters.rotFim,
  ].filter(Boolean).length

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className={`flex items-center gap-2 text-muted-foreground ${collapsed ? "" : "mb-3"}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide transition-colors hover:text-foreground"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {collapsed && activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {onReset && !collapsed && (
          <button
            onClick={onReset}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 ${collapsed ? "hidden" : ""}`}
      >
        <MultiSelectFilter
          label="HUB"
          value={filters.hub}
          allLabel="TODOS"
          options={opcoes.hubs}
          onChange={(v) => onChange({ hub: v })}
          highlight
        />
        <MultiSelectFilter
          label="Regional"
          value={filters.regional}
          allLabel="TODAS"
          options={opcoes.regionais}
          onChange={(v) => onChange({ regional: v })}
          highlight
        />
        <MultiSelectFilter
          label="Tipo Roteirização"
          value={filters.tipo}
          allLabel="TODOS"
          options={["D-1", "D-2", "W-1"]}
          onChange={(v) => onChange({ tipo: v })}
          highlight
        />
        <MultiSelectFilter
          label="Mês"
          value={filters.mes}
          allLabel="TODOS"
          options={opcoes.meses}
          onChange={(v) => onChange({ mes: v })}
        />
        <MultiSelectFilter
          label="Semana"
          value={filters.semana}
          allLabel="TODAS"
          options={opcoes.semanas}
          onChange={(v) => onChange({ semana: v })}
        />
        <DateRangeFilter
          label="Data da Roteirização"
          inicio={filters.roteirizacaoInicio}
          fim={filters.roteirizacaoFim}
          onInicio={(v) => onChange({ roteirizacaoInicio: v })}
          onFim={(v) => onChange({ roteirizacaoFim: v })}
        />
        <DateRangeFilter
          label="Data da Coleta"
          inicio={filters.rotInicio}
          fim={filters.rotFim}
          onInicio={(v) => onChange({ rotInicio: v })}
          onFim={(v) => onChange({ rotFim: v })}
        />
      </div>
    </section>
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
        <MultiSelectFilter
          label="Regional"
          value={filters.regional}
          allLabel="TODAS"
          options={opcoes.regionais}
          onChange={(v) => onChange({ regional: v })}
          highlight
        />
        <MultiSelectFilter
          label="HUB"
          value={filters.hub}
          allLabel="TODOS"
          options={opcoes.hubs}
          onChange={(v) => onChange({ hub: v })}
          highlight
        />
        <MultiSelectFilter
          label="Mês"
          value={filters.mes}
          allLabel="TODOS"
          options={opcoes.meses}
          onChange={(v) => onChange({ mes: v })}
        />
        <MultiSelectFilter
          label="Semana"
          value={filters.semana}
          allLabel="TODAS"
          options={opcoes.semanas}
          onChange={(v) => onChange({ semana: v })}
        />
        <MultiSelectFilter
          label="Tipo Roteirização"
          value={filters.tipo}
          allLabel="TODOS"
          options={["D-1", "D-2", "W-1"]}
          onChange={(v) => onChange({ tipo: v })}
          highlight
        />
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-secondary/20 p-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">Período</span>
          <DateRangeFilter
            label="Data da Roteirização"
            inicio={filters.roteirizacaoInicio}
            fim={filters.roteirizacaoFim}
            onInicio={(v) => onChange({ roteirizacaoInicio: v })}
            onFim={(v) => onChange({ roteirizacaoFim: v })}
          />
          <DateRangeFilter
            label="Data da Coleta"
            inicio={filters.rotInicio}
            fim={filters.rotFim}
            onInicio={(v) => onChange({ rotInicio: v })}
            onFim={(v) => onChange({ rotFim: v })}
          />
        </div>
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
