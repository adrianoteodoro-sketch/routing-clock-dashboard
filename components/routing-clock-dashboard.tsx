"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { DashboardHeader } from "@/components/dashboard-header"
import { FiltersTopBar } from "@/components/filters-bar"
import { KpiCards } from "@/components/kpi-cards"
import { MonthlyChart, WeeklyChart } from "@/components/performance-charts"
import { WaterfallChart } from "@/components/waterfall-chart"
import { TipoPerformanceChart } from "@/components/tipo-performance-chart"
import { AnomaliasPanel } from "@/components/anomalias-panel"
import { OffendersList, SeverityRange } from "@/components/offenders-severity"
import { HubAnalysis, HubTable } from "@/components/hub-analysis"
import { FaroContent } from "@/components/faro-board"
import { Loader2, LayoutDashboard, Building2, AlertTriangle, Radar, Home, ArrowRight } from "lucide-react"
import type { DashboardData, Filters } from "@/lib/types"

type TabId = "home" | "geral" | "acompanhamento" | "hubs"

// Metadados das páginas, usados tanto na home (cards) quanto no cabeçalho das abas.
const PAGES: {
  id: Exclude<TabId, "home">
  label: string
  descricao: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    id: "geral",
    label: "Visão Geral",
    descricao: "KPIs, performance por tipo, anomalias e HUBs impactados em um só lugar.",
    Icon: LayoutDashboard,
  },
  {
    id: "acompanhamento",
    label: "Acompanhamento da Roteirização",
    descricao: "Status em tempo real das roteirizações por HUB: pendentes, em andamento e concluídas.",
    Icon: Radar,
  },
  {
    id: "hubs",
    label: "Análise de HUBs",
    descricao: "Detalhamento por facility com métricas de atraso e severidade.",
    Icon: Building2,
  },
]

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

// Data de hoje no formato YYYY-MM-DD (fuso local), usada para iniciar os filtros de roteirização.
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const TODAY = todayISO()

// O dashboard abre na DATA DA ROTEIRIZAÇÃO de HOJE; a Data da Coleta começa sem filtro.
const DEFAULT_FILTERS: Filters = {
  regional: "TODAS",
  hub: "TODOS",
  mes: "TODOS",
  semana: "TODAS",
  tipo: "TODOS",
  rotInicio: "",
  rotFim: "",
  roteirizacaoInicio: TODAY,
  roteirizacaoFim: TODAY,
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function RoutingClockDashboard() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<TabId>("home")

  const query = useMemo(() => {
    const sp = new URLSearchParams({
      regional: filters.regional,
      hub: filters.hub,
      mes: filters.mes,
      semana: filters.semana,
      tipo: filters.tipo,
      rotInicio: filters.rotInicio,
      rotFim: filters.rotFim,
      roteirizacaoInicio: filters.roteirizacaoInicio,
      roteirizacaoFim: filters.roteirizacaoFim,
    })
    return `/api/routing-clock?${sp.toString()}`
  }, [filters])

  const { data, isLoading, isValidating, mutate } = useSWR<DashboardData>(query, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshingSource, setRefreshingSource] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

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

  // "Atualizar Dados": apenas re-busca os dados atuais do Google Sheets e atualiza
  // o dashboard. NÃO dispara o refresh da Connected Sheet / query do BigQuery
  // (acesso indisponível no momento).
  const handleRefresh = async () => {
    setRefreshingSource(true)
    setRefreshError(null)
    try {
      await mutate()
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

      {refreshError && (
        <div className="mx-auto max-w-[1600px] px-6 pt-4">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">Não foi possível atualizar a consulta na planilha.</span>
              <span className="break-words text-danger/90">{refreshError}</span>
            </div>
            <button
              type="button"
              onClick={() => setRefreshError(null)}
              className="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wide text-danger/80 hover:text-danger"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6">
        {tab === "home" ? (
          <HomeView onSelect={(id) => setTab(id)} />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {/* Navegação: voltar à home + abas */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTab("home")}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold uppercase tracking-tight text-muted-foreground transition-colors hover:bg-secondary/50"
              >
                <Home className="h-4 w-4" />
                Início
              </button>
              <div className="h-6 w-px bg-border" aria-hidden />
              {PAGES.map((p) => (
                <TabButton
                  key={p.id}
                  active={tab === p.id}
                  onClick={() => setTab(p.id)}
                  icon={<p.Icon className="h-4 w-4" />}
                  label={p.label}
                />
              ))}
            </div>

            {/* Barra de filtros horizontal no topo do conteúdo */}
            {data && (
              <FiltersTopBar
                filters={filters}
                opcoes={data.opcoes}
                onChange={handleFilterChange}
                onReset={() => setFilters(DEFAULT_FILTERS)}
              />
            )}

            {tab === "acompanhamento" ? (
            <FaroContent embedded filters={filters} />
          ) : isLoading || !data ? (
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
                  {routingDateLabel(filters.roteirizacaoInicio, filters.roteirizacaoFim)}
                </span>
              </div>

              <KpiCards
                kpis={data.kpis}
                porTipo={data.performancePorTipo}
                diasRoteirizados={data.diasRoteirizados}
              />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WaterfallChart data={data.waterfall} />
                <TipoPerformanceChart data={data.performancePorTipo} meta={data.kpis.meta} />
              </div>

              <AnomaliasPanel data={data.anomalias} />

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

function HomeView({ onSelect }: { onSelect: (id: Exclude<TabId, "home">) => void }) {
  return (
    <div className="flex flex-col gap-8 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-balance">
          Routing Clock XD
        </h1>
        <p className="max-w-2xl text-pretty text-base text-muted-foreground">
          Escolha uma área para começar. Cada painel reúne as métricas e o acompanhamento da roteirização de
          cross-docking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <p.Icon className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-bold tracking-tight text-foreground text-balance">{p.label}</h2>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{p.descricao}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              Acessar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
