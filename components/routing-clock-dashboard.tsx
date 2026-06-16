"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { DashboardHeader } from "@/components/dashboard-header"
import { FiltersBar } from "@/components/filters-bar"
import { KpiCards } from "@/components/kpi-cards"
import { MonthlyChart, WeeklyChart } from "@/components/performance-charts"
import { WaterfallChart } from "@/components/waterfall-chart"
import { OffendersList, SeverityRange } from "@/components/offenders-severity"
import { HubAnalysis } from "@/components/hub-analysis"
import { Loader2, LayoutDashboard, Building2 } from "lucide-react"
import type { DashboardData, Filters } from "@/lib/types"

type TabId = "geral" | "hubs"

const DEFAULT_FILTERS: Filters = {
  regional: "TODAS",
  mes: "TODOS",
  semana: "TODAS",
  rotInicio: "",
  rotFim: "",
  coletaInicio: "",
  coletaFim: "",
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function RoutingClockDashboard() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<TabId>("geral")

  const query = useMemo(() => {
    const sp = new URLSearchParams({
      regional: filters.regional,
      mes: filters.mes,
      semana: filters.semana,
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
    setFilters((prev) => ({ ...prev, ...next }))
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

      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6">
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

        {data && (
          <FiltersBar filters={filters} opcoes={data.opcoes} onChange={handleFilterChange} />
        )}

        {isLoading || !data ? (
          <div className="flex h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Carregando dados de roteirização...</p>
            </div>
          </div>
        ) : tab === "geral" ? (
          <>
            <KpiCards kpis={data.kpis} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <MonthlyChart data={data.mensal} meta={data.kpis.meta} />
              <WeeklyChart data={data.semanal} meta={data.kpis.meta} />
            </div>

            <WaterfallChart data={data.waterfall} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <OffendersList ofensores={data.ofensores} />
              </div>
              <SeverityRange ranges={data.rangeSeveridade} />
            </div>
          </>
        ) : (
          <HubAnalysis data={data.hubAnalise} />
        )}
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
