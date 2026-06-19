"use client"

import { Fragment, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, ChevronDown, ChevronRight, Clock, MapPin, Timer } from "lucide-react"
import type { HubAnalise, HubAnaliseSecao, HubDiaResumo, HubResumo } from "@/lib/types"

const DANGER = "oklch(0.58 0.23 18)"
const WARNING = "oklch(0.82 0.16 85)"
const MUTED = "oklch(0.55 0.02 257)"

type Metric = "atraso" | "estouro"

function fmtMin(min: number): string {
  if (min <= 0) return "0min"
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function fmtDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d)
}

/**
 * Formata apenas o horário (HH:MM) de uma data ISO.
 * Usa timeZone "UTC" porque created_time/updated_time já vêm convertidos para o fuso local
 * da operação no BigQuery e são serializados como UTC. Reformatar no fuso do navegador
 * deslocaria o horário; UTC preserva exatamente o valor exibido no sheet.
 */
function fmtTime(iso: string): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d)
}

/** Cartão de KPI compacto da seção. */
function SectionKpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone: "danger" | "warning"
}) {
  const toneCls = tone === "danger" ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning"
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${toneCls}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

/** Gráfico de barras horizontais com os piores HUBs. */
function WorstHubsChart({ hubs, metric }: { hubs: HubResumo[]; metric: Metric }) {
  const data = hubs.slice(0, 10).map((h) => ({
    label: h.facilityId,
    ocorrencias: h.ocorrencias,
    pct: h.pct,
  }))
  const color = metric === "atraso" ? DANGER : WARNING
  const titulo = metric === "atraso" ? "Piores HUBs por Atraso" : "Piores HUBs por Estouro de TMR"

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-base font-bold uppercase tracking-tight text-foreground">{titulo}</h3>
        <p className="py-10 text-center text-sm italic text-muted-foreground">Nenhuma ocorrência no período</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-bold uppercase tracking-tight text-foreground">{titulo}</h3>
      <p className="mb-4 text-sm text-muted-foreground">Top 10 por número de ocorrências</p>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="oklch(0.92 0.004 247)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={92}
            tick={{ fill: MUTED, fontSize: 11, fontWeight: 600 }}
          />
          <Bar dataKey="ocorrencias" radius={[0, 6, 6, 0]} maxBarSize={26}>
            <LabelList
              dataKey="ocorrencias"
              position="right"
              className="fill-foreground text-[11px] font-bold"
            />
            {data.map((_, i) => (
              <Cell key={i} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Distribuição por regional. */
function RegionalBreakdown({ secao }: { secao: HubAnaliseSecao }) {
  const max = Math.max(...secao.regionais.map((r) => r.ocorrencias), 1)
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold uppercase tracking-tight text-foreground">Por Regional</h3>
          <p className="text-sm text-muted-foreground">Ocorrências agrupadas por regional</p>
        </div>
      </div>
      {secao.regionais.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-muted-foreground">Nenhuma ocorrência no período</p>
      ) : (
        <div className="flex flex-col gap-4">
          {secao.regionais.map((r) => (
            <div key={r.regional}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{r.regional}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{r.pct.toFixed(1)}%</span>
                  <span className="text-sm font-bold text-foreground">{r.ocorrencias}</span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(r.ocorrencias / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Abertura por dia de um HUB: mini-gráfico + tabela (atrasos + TMR juntos). */
function DailyBreakdown({ abertura, metric }: { abertura: HubDiaResumo[]; metric: Metric }) {
  if (abertura.length === 0) {
    return <p className="py-6 text-center text-sm italic text-muted-foreground">Sem dias no período</p>
  }

  const chartData = abertura.map((d) => ({
    dia: fmtDay(d.dia),
    Atrasos: d.atrasos,
    Estouros: d.estouros,
    "TMR médio (h)": Number((d.tmrMedioMin / 60).toFixed(2)),
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Mini-gráfico: barras de ocorrências + linha de TMR médio */}
      <div className="rounded-xl border border-border bg-card p-3">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="oklch(0.92 0.004 247)" />
            <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 10 }} />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={{ fill: MUTED, fontSize: 10 }}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: MUTED, fontSize: 10 }}
              unit="h"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid oklch(0.92 0.004 247)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="Atrasos" radius={[4, 4, 0, 0]} maxBarSize={26} fill={DANGER} />
            <Bar yAxisId="left" dataKey="Estouros" radius={[4, 4, 0, 0]} maxBarSize={26} fill={WARNING} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="TMR médio (h)"
              stroke={MUTED}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela diária */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-semibold uppercase tracking-wide">Dia (coleta)</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Início</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Fim</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Roteiros</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Atrasos</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Atraso médio</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Pior atraso</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">TMR médio</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">TMR alvo</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">Estouros</th>
            </tr>
          </thead>
          <tbody>
            {abertura.map((d) => {
              const temAtraso = d.atrasos > 0
              const temEstouro = d.estouros > 0
              return (
                <tr key={d.dia} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium text-foreground">{fmtDay(d.dia)}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{fmtTime(d.inicioISO)}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">{fmtTime(d.fimISO)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{d.total}</td>
                  <td className={`px-3 py-2 text-right font-bold ${temAtraso ? "text-danger" : "text-muted-foreground"}`}>
                    {d.atrasos}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {temAtraso ? fmtMin(d.atrasoMedioMin) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {temAtraso ? fmtMin(d.atrasoPiorMin) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{fmtMin(d.tmrMedioMin)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtMin(d.tmrAlvoMin)}</td>
                  <td
                    className={`px-3 py-2 text-right font-bold ${temEstouro ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {d.estouros}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Tabela de HUBs com drill-down por roteiro. */
export function HubTable({ secao, metric }: { secao: HubAnaliseSecao; metric: Metric }) {
  const [open, setOpen] = useState<string | null>(null)
  const magLabel = metric === "atraso" ? "Atraso" : "Excesso TMR"

  if (secao.hubs.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="py-10 text-center text-sm italic text-muted-foreground">
          Nenhum HUB com {metric === "atraso" ? "atraso" : "estouro de TMR"} no período selecionado
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/20 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {secao.hubs.length} {secao.hubs.length === 1 ? "HUB impactado" : "HUBs impactados"}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <ChevronDown className="h-3.5 w-3.5" />
          Clique em um HUB para ver os roteiros
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <th className="w-10 px-4 py-3" aria-label="Expandir" />
              <th className="px-4 py-3 font-bold uppercase tracking-wide text-muted-foreground">HUB</th>
              <th className="px-4 py-3 font-bold uppercase tracking-wide text-muted-foreground">Regional</th>
              <th className="px-4 py-3 text-right font-bold uppercase tracking-wide text-muted-foreground">
                Ocorrências
              </th>
              <th className="px-4 py-3 text-right font-bold uppercase tracking-wide text-muted-foreground">% do HUB</th>
              <th className="px-4 py-3 text-right font-bold uppercase tracking-wide text-muted-foreground">
                Pior {magLabel}
              </th>
              <th className="px-4 py-3 text-right font-bold uppercase tracking-wide text-muted-foreground">
                Média {magLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {secao.hubs.map((h) => {
              const isOpen = open === h.facilityId
              return (
                <Fragment key={h.facilityId}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : h.facilityId)}
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-secondary/40 ${
                      isOpen ? "bg-secondary/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                          isOpen ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-foreground">{h.facilityId}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{h.regional}</td>
                    <td className="px-4 py-3 text-right font-bold text-danger">{h.ocorrencias}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{h.pct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{fmtMin(h.piorMinutos)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmtMin(h.mediaMinutos)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border bg-secondary/20">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="flex flex-col gap-5">
                          {/* Abertura por dia: atrasos + TMR juntos com mini-gráfico */}
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                              Abertura por dia — {h.facilityId}
                            </p>
                            <DailyBreakdown abertura={h.abertura} metric={metric} />
                          </div>

                          {/* Roteiros individuais com a ocorrência */}
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                              Roteiros com {metric === "atraso" ? "atraso" : "estouro de TMR"}
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[560px] border-collapse text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="px-3 py-2 font-semibold uppercase tracking-wide">Coleta</th>
                                    <th className="px-3 py-2 font-semibold uppercase tracking-wide">Tipo</th>
                                    <th className="px-3 py-2 font-semibold uppercase tracking-wide">Prazo</th>
                                    <th className="px-3 py-2 font-semibold uppercase tracking-wide">Publicado</th>
                                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                                      {magLabel}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {h.detalhes.map((d, i) => (
                                    <tr key={i} className="border-t border-border/60">
                                      <td className="px-3 py-2 font-medium text-foreground">
                                        {fmtDay(d.collectionDate)}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">
                                        {d.planificationType === "tactical" ? "W-1" : "D-1"}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.deadline)}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(d.publishedAt)}</td>
                                      <td className="px-3 py-2 text-right font-bold text-danger">
                                        {metric === "atraso" ? fmtMin(d.minutesLate) : fmtMin(d.tmrExcessMinutes)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Section({ secao, metric, selectedHub }: { secao: HubAnaliseSecao; metric: Metric; selectedHub?: string }) {
  const isAtraso = metric === "atraso"
  // Quando um HUB específico está selecionado no filtro, destacamos sua abertura diária.
  const focado =
    selectedHub && selectedHub !== "TODOS" ? secao.hubs.find((h) => h.facilityId === selectedHub) : undefined
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isAtraso ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning"
          }`}
        >
          {isAtraso ? <Clock className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
        </div>
        <div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-foreground">
            {isAtraso ? "Roteirizações com Atraso" : "Estouro de TMR"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAtraso
              ? "HUBs que publicaram roteiros após o prazo de entrega"
              : "HUBs cuja duração excedeu o TMR Alvo (TMR x 1,30)"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SectionKpi
          icon={isAtraso ? <Clock className="h-6 w-6" /> : <Timer className="h-6 w-6" />}
          label={isAtraso ? "Roteiros em Atraso" : "Roteiros em Estouro"}
          value={secao.totalOcorrencias.toLocaleString("pt-BR")}
          hint={`${secao.pctOcorrencias.toFixed(2)}% de ${secao.totalRoteiros.toLocaleString("pt-BR")} roteiros`}
          tone={isAtraso ? "danger" : "warning"}
        />
        <SectionKpi
          icon={<AlertTriangle className="h-6 w-6" />}
          label="HUBs Impactados"
          value={secao.hubs.length.toLocaleString("pt-BR")}
          hint="Facilities com ao menos 1 ocorrência"
          tone={isAtraso ? "danger" : "warning"}
        />
        <SectionKpi
          icon={<MapPin className="h-6 w-6" />}
          label="Regionais Impactadas"
          value={secao.regionais.length.toLocaleString("pt-BR")}
          hint="Regionais com ao menos 1 ocorrência"
          tone={isAtraso ? "danger" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WorstHubsChart hubs={secao.hubs} metric={metric} />
        <RegionalBreakdown secao={secao} />
      </div>

      {focado && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {isAtraso ? <Clock className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-tight text-foreground">
                Abertura por dia — {focado.facilityId}
              </h3>
              <p className="text-sm text-muted-foreground">
                {focado.regional} · {focado.ocorrencias} {isAtraso ? "atrasos" : "estouros"} em{" "}
                {focado.total.toLocaleString("pt-BR")} roteiros
              </p>
            </div>
          </div>
          <DailyBreakdown abertura={focado.abertura} metric={metric} />
        </div>
      )}

      <HubTable secao={secao} metric={metric} />
    </section>
  )
}

export function HubAnalysis({ data, selectedHub }: { data: HubAnalise; selectedHub?: string }) {
  return (
    <div className="flex flex-col gap-10">
      <Section secao={data.atraso} metric="atraso" selectedHub={selectedHub} />
      <div className="h-px w-full bg-border" />
      <Section secao={data.estouro} metric="estouro" selectedHub={selectedHub} />
    </div>
  )
}
