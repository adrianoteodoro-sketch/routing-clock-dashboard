"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { DashboardHeader } from "@/components/dashboard-header"
import { FiltersBar } from "@/components/filters-bar"
import { KpiCards } from "@/components/kpi-cards"
import { MonthlyChart, WeeklyChart } from "@/components/performance-charts"
import { WaterfallChart } from "@/components/waterfall-chart"
import { TipoPerformanceChart } from "@/components/tipo-performance-chart"
import { OffendersList, SeverityRange } from "@/components/offenders-severity"
import { HubAnalysis, HubTable } from "@/components/hub-analysis"
import { Loader2, LayoutDashboard, Building2, AlertTriangle } from "lucide-react"
import type { DashboardData, Filters } from "@/lib/types"

type TabId = "geral" | "hubs"

// Data de hoje no formato YYYY-MM-DD (fuso local), usada para iniciar os filtros de roteirização.
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const TODAY = todayISO()

// Formata "YYYY-MM-DD" -> "22 de junho de 2026" (pt-BR).
function formatDateBR(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
}

// Monta o rótulo da data de roteirização exibido no topo do report.
function routingDateLabel(rotInicio: string, rotFim: string): string {
  if (!rotInicio && !rotFim) return "Todas as datas"
  if (rotInicio && rotFim && rotInicio === rotFim) return formatDateBR(rotInicio)
  if (rotInicio && rotFim) return `${formatDateBR(rotInicio)} — ${formatDateBR(rotFim)}`
  return formatDateBR(rotInicio || rotFim)
}

const DEFAULT_FILTERS: Filters = {
  regional: "TODAS",
  hub: "TODOS",
  mes: "TODOS",
  semana: "TODAS",
  tipo: "TODOS",
  rotInicio: TODAY,
  rotFim: TODAY,
  coletaInicio: "",
  coletaFim: "",
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function RoutingClockDashboard() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<TabId>("geral")
  const [filtersCollapsed, setFiltersCollapsed] = useState(false)

  const query = useMemo(() => {
    const sp = new URLSearchParams({
      regional: filters.regional,
      hub: filters.hub,
      mes: filters.mes,
      semana: filters.semana,
      tipo: filters.tipo,
      rotInicio: filters.rotInicio,
      rotFim: filters.rotFim,
      coletaInicio: filters.coletaInicio,
      coletaFim: filters.coletaFim,
    })
    return `/api/routing-clock?${sp.toString()}`
  }, [filters])

  const { data, isLoading, isValidating, mutate } = useSWR<DashboardData>(query, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshingSource, setRefreshingSource] = useState(false)

  // Atualiza o horário sempre que novos dados chegam com sucesso.
  useEffect(() => {
    if (data && !isValidating) {
      setLastUpdated(new Date())
    }
  }, [data, isValidating])

  const handleFilterChange = (next: Partial<Filters>) => {
    setFilters((prev) => {
      const merged = { ...prev, ...next }
      // Ao trocar de regional, zera o HUB para evitar combinação inválida.
      if (next.regional && next.regional !== prev.regional) merged.hub = "TODOS"
      return merged
    })
  }

  // "Atualizar Dados": força a Connected Sheet a re-consultar o BigQuery (refresh=1)
  // e injeta o resultado fresco no cache do SWR.
  const handleRefresh = async () => {
    setRefreshingSource(true)
    try {
      const res = await fetch(`${query}&refresh=1`)
      const fresh = (await res.json()) as DashboardData
      await mutate(fresh, { revalidate: false })
      setLastUpdated(new Date())
    } catch {
      await mutate()
    } finally {
      setRefreshingSource(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        onRefresh={handleRefresh}
        refreshing={isValidating || refreshingSource}
        lastUpdated={lastUpdated}
      />

      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start">
        {/* Barra lateral de filtros (recolhível) - lado esquerdo */}
        {data && (
          <FiltersBar
            filters={filters}
            opcoes={data.opcoes}
            onChange={handleFilterChange}
            collapsed={filtersCollapsed}
            onToggle={() => setFiltersCollapsed((c) => !c)}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />
        )}

        {/* Conteúdo principal */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* Seletor de abas */}
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={tab === "geral"}
              onClick={() => setTab("geral")}
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Visão Geral"
            />
            <TabButton
              active={tab === "hubs"}
              onClick={() => setTab("hubs")}
              icon={<Building2 className="h-4 w-4" />}
              label="Análise de HUBs"
            />
          </div>

          {isLoading || !data ? (
            <div className="flex h-[60vh] items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Carregando dados de roteirização...</p>
              </div>
            </div>
          ) : tab === "geral" ? (
            <>
              {/* Data da roteirização (mesma do filtro) - destaque para report gerencial */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Data da Roteirização
                </span>
                <span className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {routingDateLabel(filters.rotInicio, filters.rotFim)}
                </span>
              </div>

              <KpiCards kpis={data.kpis} porTipo={data.performancePorTipo} />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WaterfallChart data={data.waterfall} />
                <TipoPerformanceChart data={data.performancePorTipo} meta={data.kpis.meta} />
              </div>

              {/* HUBs Impactados */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">HUBs Impactados</h2>
                    <p className="text-sm text-muted-foreground">
                      Facilities que publicaram roteiros após o prazo de entrega
                    </p>
                  </div>
                </div>
                <HubTable secao={data.hubAnalise.atraso} metric="atraso" />
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <OffendersList ofensores={data.ofensores} />
                </div>
                <SeverityRange ranges={data.rangeSeveridade} />
              </div>

              {/* Gráficos de performance ao final da página */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <MonthlyChart data={data.mensal} meta={data.kpis.meta} />
                <WeeklyChart data={data.semanal} meta={data.kpis.meta} />
              </div>
            </>
          ) : (
            <HubAnalysis data={data.hubAnalise} selectedHub={filters.hub} />
          )}
        </div>
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold uppercase tracking-tight transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
