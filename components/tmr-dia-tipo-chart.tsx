"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TmrDiaTipo } from "@/lib/types"

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}min`
}

function TmrTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string; value?: number; payload?: TmrDiaTipo }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
      <p className="mb-2 font-bold text-foreground">{label}</p>
      {payload.map((item) => {
        const isD1 = item.dataKey === "d1Min"
        const volume = isD1 ? row?.d1Volume : row?.w1Volume
        return (
          <p key={item.dataKey} className="text-muted-foreground">
            <span className="font-semibold text-foreground">{isD1 ? "D-1" : "W-1"}:</span>{" "}
            {formatMinutes(Number(item.value))} ({volume} roteiro{volume === 1 ? "" : "s"})
          </p>
        )
      })}
    </div>
  )
}

function TmrOperationChart({ facilityId, data }: { facilityId: string; data: TmrDiaTipo[] }) {
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-base font-bold text-foreground">{facilityId}</h4>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {data.reduce((total, item) => total + item.d1Volume + item.w1Volume, 0)} roteiros
        </span>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 30, right: 8, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="diaSemana"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(value) => formatMinutes(Number(value))}
              width={52}
            />
            <Tooltip content={<TmrTooltip />} cursor={{ fill: "var(--secondary)" }} />
            <Legend />
            <Bar dataKey="d1Min" name="D-1" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={44}>
              <LabelList
                dataKey="d1Min"
                position="top"
                formatter={(value) => (typeof value === "number" ? formatMinutes(value) : "")}
                fill="var(--foreground)"
                fontSize={11}
                fontWeight={700}
              />
            </Bar>
            <Bar dataKey="w1Min" name="W-1" fill="var(--warning)" radius={[6, 6, 0, 0]} maxBarSize={44}>
              <LabelList
                dataKey="w1Min"
                position="top"
                formatter={(value) => (typeof value === "number" ? formatMinutes(value) : "")}
                fill="var(--foreground)"
                fontSize={11}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

export function TmrDiaTipoChart({ data }: { data: TmrDiaTipo[] }) {
  if (!data.length) return null

  const facilities = ["ARENA", "BRXSP10"].filter((facilityId) =>
    data.some((item) => item.facilityId === facilityId),
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">
          TMR executado por dia e tipo
        </h3>
        <p className="text-sm text-muted-foreground">
          Duração média real por dia da semana da coleta, segmentada entre D-1 e W-1 por operação
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {facilities.map((facilityId) => (
          <TmrOperationChart
            key={facilityId}
            facilityId={facilityId}
            data={data.filter((item) => item.facilityId === facilityId)}
          />
        ))}
      </div>
    </section>
  )
}
