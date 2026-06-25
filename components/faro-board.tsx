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
  LoaderCircle,
  Building2,
} from "lucide-react"
import type { FaroData, FaroHub, FaroOrder, FaroTipo } from "@/lib/faro"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TIPO_INFO: Record<string, { label: string; descricao: string; accent: string }> = {
  "W-1": { label: "W-1", descricao: "Tático (semana anterior)", accent: "bg-primary" },
  "D-1": { label: "D-1", descricao: "Replanejamento (D-1)", accent: "bg-chart-2" },
  "D-2": { label: "D-2", descricao: "Longa distância (D-2)", accent: "bg-chart-4" },
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

export function FaroContent({ embedded = false }: { embedded?: boolean }) {
  const [date, setDate] = useState<string>(todayISO())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const query = `/api/faro?date=${date}`
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
    }),
    [data],
  )

  const pct = totals.total > 0 ? Math.round((totals.publicadas / totals.total) * 100) : 0

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
                ACOMPANHAMENTO DA <span className="text-primary">ROTEIRIZAÇÃO</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
      ) : totals.total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center text-muted-foreground">
          Nenhuma roteirização iniciada em {formatDayShort(date)}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {(data?.tipos ?? []).map((tipo) => (
            <TipoColumn key={tipo.tipo} tipo={tipo} />
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

function TipoColumn({ tipo }: { tipo: FaroTipo }) {
  const info = TIPO_INFO[tipo.tipo] ?? { label: tipo.tipo, descricao: "", accent: "bg-primary" }
  const pct = tipo.total > 0 ? Math.round((tipo.publicadas / tipo.total) * 100) : 0
  return (
    <section className="flex flex-col rounded-xl border border-border bg-secondary/40">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 items-center rounded-lg ${info.accent} px-2.5 text-sm font-bold text-primary-foreground`}>
            {info.label}
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">{info.descricao}</p>
            <p className="text-[11px] text-muted-foreground">
              {tipo.publicadas}/{tipo.total} publicadas · {pct}%
            </p>
          </div>
        </div>
        {tipo.iniciadas > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-[11px] font-bold text-warning">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            {tipo.iniciadas}
          </span>
        )}
      </header>

      <div className="flex flex-col gap-3 p-3">
        {tipo.hubs.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Sem roteirizações neste tipo.</p>
        ) : (
          tipo.hubs.map((hub) => <HubCard key={hub.hub} hub={hub} />)
        )}
      </div>
    </section>
  )
}

function HubCard({ hub }: { hub: FaroHub }) {
  const allDone = hub.iniciadas === 0
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold text-foreground">{hub.hub}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {hub.regional}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold ${
            allDone ? "text-success" : "text-warning"
          }`}
        >
          {allDone ? <CircleCheck className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {hub.publicadas}/{hub.total}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {hub.orders.map((order, i) => (
          <OrderChip key={`${order.collectionDate}-${i}`} order={order} />
        ))}
      </div>
    </div>
  )
}

function OrderChip({ order }: { order: FaroOrder }) {
  const publicada = order.status === "publicada"
  const cls = publicada
    ? "bg-success/12 text-success border-success/30"
    : "bg-warning/15 text-warning border-warning/30"
  const time = publicada ? formatTime(order.publishedAt) : formatTime(order.startedAt)
  const title = publicada
    ? `Publicada às ${formatTime(order.publishedAt)} · coleta ${formatDayShort(order.collectionDate)}`
    : `Iniciada às ${formatTime(order.startedAt)} · coleta ${formatDayShort(order.collectionDate)}`
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${cls}`}
    >
      {publicada ? <CircleCheck className="h-3 w-3" /> : <LoaderCircle className="h-3 w-3 animate-spin" />}
      {formatDayShort(order.collectionDate)}
      <span className="opacity-70">{time}</span>
    </span>
  )
}
