"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { DashboardHeader } from "@/components/dashboard-header"
import { FiltersBar } from "@/components/filters-bar"
import { KpiCards } from "@/components/kpi-cards"
import { MonthlyChart, WeeklyChart } from "@/components/performance-charts"
import { WaterfallChart } from "@/components/waterfall-chart"
import { OffendersList, SeverityRange } from "@/components/offenders-severity"
import { Database, Loader2 } from "lucide-react"
import type { DashboardData, Filters } from "@/lib/types"

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

  // Atualiza o horário sempre que novos dados chegam com sucesso.
  useEffect(() => {
    if (data && !isValidating) {
      setLastUpdated(new Date())
    }
  }, [data, isValidating])

  const handleFilterChange = (next: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...next }))
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader onRefresh={() => mutate()} refreshing={isValidating} lastUpdated={lastUpdated} />

      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6">
        {data && (
          <FiltersBar filters={filters} opcoes={data.opcoes} onChange={handleFilterChange} />
        )}

        {data?.fonte === "mock" && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-foreground">
            <Database className="h-4 w-4 text-warning" />
            <span>
              <strong>Dados de exemplo</strong> — o preview roda fora do perímetro VPC do BigQuery. Em produção
              (dentro do perímetro), a query real do <code className="font-mono text-xs">meli-bi-data</code> é usada
              automaticamente.
            </span>
          </div>
        )}

        {isLoading || !data ? (
          <div className="flex h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Carregando dados de roteirização...</p>
            </div>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  )
}
