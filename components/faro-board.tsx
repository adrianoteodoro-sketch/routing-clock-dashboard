"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  Package,
  RefreshCw,
  Radar,
  ArrowLeft,
  CircleCheck,
  CircleDashed,
  CircleAlert,
  LoaderCircle,
  Building2,
  SlidersHorizontal,
} from "lucide-react"
import type { FaroData, FaroHub, FaroOrder, FaroTipo } from "@/lib/faro"
import type { Filters } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_INFO: Record<string, { label: string; descricao: string; accent: string }> = {
  "W-1": { label: "W-1", descricao: "Tático (semana anterior)", accent: "bg-primary" },
  "D-1": { label: "D-1", descricao: "Replanejamento (D-1)", accent: "bg-chart-2" },
  "D-2": { label: "D-2", descricao: "Exceção (D-2)", accent: "bg-chart-4" },
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatTime(iso: string): string {
  if (!iso) return "--:--"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--:--"
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d)
}

function formatDayShort(iso: string): string {
  if (!iso) return "--"
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

export function FaroBoard() {
  return (
    <main className="min-h-screen bg-background">
      {/* Barra de marca */}
      <div className="w-full bg-brand-yellow">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-foreground" strokeWidth={2.2} />
            <span className="text-xl font-bold tracking-tight text-foreground">Mercado Livre</span>
          </div>
          <Link
            href="/routing-clock"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground/10 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Routing Clock
          </Link>
        </div>
      </div>

      <FaroContent />
    </main>
  )
}

const SEM_REPLAN_KEY = "faro:semReplan"

export function FaroContent({ embedded = false, filters }: { embedded?: boolean; filters?: Filters }) {
  const [date, setDate] = useState<string>(todayISO())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // HUBs SEM replan (D-1). Default = todos COM replan (conjunto vazio). Persiste no navegador.
  const [semReplan, setSemReplan] = useState<Set<string>>(new Set())
  const [showReplan, setShowReplan] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEM_REPLAN_KEY)
      if (raw) setSemReplan(new Set(JSON.parse(raw) as string[]))
    } catch {
      // ignora
    }
  }, [])

  const toggleReplan = (hub: string) => {
    setSemReplan((prev) => {
      const next = new Set(prev)
      if (next.has(hub)) next.delete(hub)
      else next.add(hub)
      try {
        localStorage.setItem(SEM_REPLAN_KEY, JSON.stringify([...next]))
      } catch {
        // ignora
      }
      return next
    })
  }

  // Quando recebe os filtros da barra lateral, a "Data da Roteirização" (início do
  // período) define o dia monitorado, e o fim do período, a "Data da Coleta" e os
  // filtros de Regional/HUB/Tipo também são aplicados. Caso contrário (página
  // standalone), usa o seletor de dia próprio.
  const effectiveDate = filters?.roteirizacaoInicio || date

  const query = useMemo(() => {
    const sp = new URLSearchParams({ date: effectiveDate })
    if (filters) {
      sp.set("regional", filters.regional)
      sp.set("hub", filters.hub)
      sp.set("tipo", filters.tipo)
      // Intervalo de data da roteirização (fim) e de data da coleta.
      if (filters.roteirizacaoFim) sp.set("dateFim", filters.roteirizacaoFim)
      if (filters.rotInicio) sp.set("colInicio", filters.rotInicio)
      if (filters.rotFim) sp.set("colFim", filters.rotFim)
    }
    if (semReplan.size > 0) sp.set("semReplan", [...semReplan].join(","))
    return `/api/faro?${sp.toString()}`
  }, [effectiveDate, filters, semReplan])

  const { data, isLoading, isValidating, mutate } = useSWR<FaroData>(query, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    refreshInterval: 60_000, // auto-refresh a cada 60s
  })

  useEffect(() => {
    if (data && !isValidating) setLastUpdated(new Date())
  }, [data, isValidating])

  const totals = useMemo(
    () => ({
      total: data?.total ?? 0,
      iniciadas: data?.iniciadas ?? 0,
      publicadas: data?.publicadas ?? 0,
      necessarias: data?.necessarias ?? 0,
      concluidas: data?.concluidas ?? 0,
    }),
    [data],
  )

  // Percentual de conclusão = roteiros necessários concluídos / total necessário.
  const pct = totals.necessarias > 0 ? Math.round((totals.concluidas / totals.necessarias) * 100) : 0

  // Tipos visíveis: quando há filtro de tipo, mostra apenas os selecionados.
  const tipoFilter =
    filters?.tipo && filters.tipo !== "TODOS"
      ? filters.tipo.split(",").map((s) => s.trim())
      : null
  const visibleTipos = (data?.tipos ?? []).filter((t) => (tipoFilter ? tipoFilter.includes(t.tipo) : true))
  const hasAnyHub = visibleTipos.some((t) => t.hubs.length > 0)
  // Quando há apenas um tipo selecionado, usa layout paisagem (HUBs em grade horizontal).
  const landscape = visibleTipos.length === 1

  // HUBs candidatos a replan (D-1): todos que aparecem nos tipos W-1/D-1 (exclui exceção D-2).
  const replanHubs = useMemo(() => {
    const set = new Set<string>()
    for (const t of data?.tipos ?? []) {
      if (t.tipo === "D-2") continue
      for (const h of t.hubs) set.add(h.hub)
    }
    return [...set].sort()
  }, [data])

  return (
    <div className={embedded ? "flex flex-col gap-6" : "mx-auto max-w-[1600px] px-6 py-6"}>
      {/* Título + controles */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-1 rounded-full bg-primary" aria-hidden />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Radar className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                ACOMPANHAMENTO DA ROTEIRIZAÇÃO
              </h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!filters && (
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="text-muted-foreground">Dia da Roteirização</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || todayISO())}
                aria-label="Dia da roteirização monitorado"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}
          <button
            onClick={() => setShowReplan((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-accent"
            aria-expanded={showReplan}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Replan (D-1){semReplan.size > 0 ? ` · ${semReplan.size} sem` : ""}
          </button>
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {showReplan && (
        <ReplanPanel
          hubs={replanHubs}
          semReplan={semReplan}
          onToggle={toggleReplan}
          onClose={() => setShowReplan(false)}
        />
      )}

      {/* Resumo geral */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Roteirizações" value={totals.total} tone="neutral" />
        <SummaryCard label="Em andamento" value={totals.iniciadas} tone="warning" icon="loading" />
        <SummaryCard label="Publicadas" value={totals.publicadas} tone="success" icon="check" />
        <SummaryCard label="Concluído" value={`${pct}%`} tone="primary" />
      </section>

      {/* Legenda + status de atualização */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-warning" /> Iniciada / em andamento
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-success" /> Publicada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-muted-foreground/40" /> Pendente / data faltante
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-destructive" /> Atrasado (fora do prazo)
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {isValidating
            ? "Atualizando..."
            : lastUpdated
              ? `Atualizado às ${formatTimestamp(lastUpdated)} · auto a cada 60s`
              : "Aguardando dados..."}
        </p>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-20 text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Carregando o acompanhamento...
        </div>
      ) : !hasAnyHub ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center text-muted-foreground">
          Nenhum HUB esperado para {formatDayShort(effectiveDate)} com os filtros atuais.
        </div>
      ) : (
        <div className={landscape ? "flex flex-col gap-5" : "grid grid-cols-1 gap-5 lg:grid-cols-3"}>
          {visibleTipos.map((tipo) => (
            <TipoColumn key={tipo.tipo} tipo={tipo} landscape={landscape} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number | string
  tone: "neutral" | "warning" | "success" | "primary"
  icon?: "loading" | "check"
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground"
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon === "loading" && <LoaderCircle className="h-3.5 w-3.5" />}
        {icon === "check" && <CircleCheck className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  )
}

function TipoColumn({ tipo, landscape = false }: { tipo: FaroTipo; landscape?: boolean }) {
  const info = TIPO_INFO[tipo.tipo] ?? { label: tipo.tipo, descricao: "", accent: "bg-primary" }
  // Percentual por tipo = roteiros necessários concluídos / total necessário.
  const pct = tipo.necessarias > 0 ? Math.round((tipo.concluidas / tipo.necessarias) * 100) : 0
  return (
    <section className="flex flex-col rounded-xl border border-border bg-secondary/40">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 items-center rounded-lg ${info.accent} px-2.5 text-sm font-bold text-primary-foreground`}>
            {info.label}
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">{info.descricao}</p>
            <p className="text-[11px] text-muted-foreground">
              {tipo.concluidas}/{tipo.necessarias} concluídos · {pct}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {tipo.iniciadas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-bold text-warning">
              <LoaderCircle className="h-3 w-3 animate-spin" />
              {tipo.iniciadas}
            </span>
          )}
          {tipo.pendentes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
              <CircleDashed className="h-3 w-3" />
              {tipo.pendentes} pendente{tipo.pendentes > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      <div
        className={
          landscape
            ? "grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            : "flex flex-col gap-3 p-3"
        }
      >
        {tipo.hubs.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhum HUB esperado neste tipo.</p>
        ) : (
          tipo.hubs.map((hub) => <HubCard key={hub.hub} hub={hub} />)
        )}
      </div>
    </section>
  )
}

function HubCard({ hub }: { hub: FaroHub }) {
  const pendente = hub.pendente || hub.total === 0
  const lateCount = hub.orders.filter((o) => o.late).length
  // "Atrasado" inclui coletas faltantes fora do prazo E roteiros feitos fora da meta.
  const hasOverdue = hub.overdueDates.length > 0 || lateCount > 0
  const allDone = !pendente && hub.iniciadas === 0
  const borderClass = hasOverdue
    ? "border-destructive/50 bg-destructive/5"
    : pendente
      ? "border-dashed border-border bg-muted/30"
      : "border-border bg-card"
  return (
    <div className={`rounded-lg border p-3 ${borderClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className={`text-sm font-bold ${pendente && !hasOverdue ? "text-muted-foreground" : "text-foreground"}`}>
            {hub.hub}
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {hub.regional}
          </span>
        </div>
        {hasOverdue ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive">
            <CircleAlert className="h-3.5 w-3.5" />
            {hub.overdueDates.length + lateCount} atrasado{hub.overdueDates.length + lateCount > 1 ? "s" : ""}
          </span>
        ) : pendente ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" />
            Pendente
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold ${
              allDone ? "text-success" : "text-warning"
            }`}
          >
            {allDone ? <CircleCheck className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {hub.publicadas}/{hub.total}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {hub.overdueDates.map((d) => (
          <OverdueChip key={`over-${d}`} collectionDate={d} />
        ))}
        {hub.orders.map((order, i) => (
          <OrderChip key={`${order.collectionDate}-${i}`} order={order} />
        ))}
        {hub.missingDates.map((d) => (
          <MissingChip key={`miss-${d}`} collectionDate={d} />
        ))}
        {!pendente &&
          hub.orders.length === 0 &&
          hub.missingDates.length === 0 &&
          hub.overdueDates.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Sem datas esperadas.</span>
          )}
      </div>
    </div>
  )
}

function OverdueChip({ collectionDate }: { collectionDate: string }) {
  return (
    <span
      title={`Coleta ${formatDayShort(collectionDate)} fora do prazo de roteirização`}
      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive"
    >
      <CircleAlert className="h-3 w-3" />
      {formatDayShort(collectionDate)}
      <span className="opacity-70">atrasado</span>
    </span>
  )
}

function MissingChip({ collectionDate }: { collectionDate: string }) {
  return (
    <span
      title={`Coleta ${formatDayShort(collectionDate)} ainda não roteirizada`}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground"
    >
      <CircleDashed className="h-3 w-3" />
      {formatDayShort(collectionDate)}
      <span className="opacity-70">faltante</span>
    </span>
  )
}

function OrderChip({ order }: { order: FaroOrder }) {
  const publicada = order.status === "publicada"
  // Roteiro feito fora da meta (ex.: W-1 seg/ter roteirizado na quinta) destaca em vermelho.
  const cls = order.late
    ? "bg-destructive/10 text-destructive border-destructive/40"
    : publicada
      ? "bg-success/12 text-success border-success/30"
      : "bg-warning/15 text-warning border-warning/30"
  const time = publicada ? formatTime(order.publishedAt) : formatTime(order.startedAt)
  const baseTitle = publicada
    ? `Publicada às ${formatTime(order.publishedAt)} · coleta ${formatDayShort(order.collectionDate)}`
    : `Iniciada às ${formatTime(order.startedAt)} · coleta ${formatDayShort(order.collectionDate)}`
  const title = order.late ? `${baseTitle} · roteirizado fora da meta` : baseTitle
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${cls}`}
    >
      {order.late ? (
        <CircleAlert className="h-3 w-3" />
      ) : publicada ? (
        <CircleCheck className="h-3 w-3" />
      ) : (
        <LoaderCircle className="h-3 w-3 animate-spin" />
      )}
      {formatDayShort(order.collectionDate)}
      <span className="opacity-70">{time}</span>
    </span>
  )
}

function ReplanPanel({
  hubs,
  semReplan,
  onToggle,
  onClose,
}: {
  hubs: string[]
  semReplan: Set<string>
  onToggle: (hub: string) => void
  onClose: () => void
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Replan (D-1) por HUB</h2>
          <p className="text-[11px] text-muted-foreground">
            Marque os HUBs que têm replan (D-1). HUBs desmarcados não entram no percentual de conclusão.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary"
        >
          Fechar
        </button>
      </div>
      {hubs.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Nenhum HUB disponível para configurar.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {hubs.map((hub) => {
            const temReplan = !semReplan.has(hub)
            return (
              <label
                key={hub}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  temReplan ? "border-border bg-secondary/40 text-foreground" : "border-dashed border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <input
                  type="checkbox"
                  checked={temReplan}
                  onChange={() => onToggle(hub)}
                  className="h-4 w-4 accent-primary"
                  aria-label={`${hub} tem replan D-1`}
                />
                {hub}
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}
