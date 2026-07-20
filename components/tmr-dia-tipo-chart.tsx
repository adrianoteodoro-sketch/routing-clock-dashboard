"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { TmrDiaTipo } from "@/lib/types"

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}min`
}

function TmrTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number; payload?: TmrDiaTipo }>; label?: string }) {
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

export function TmrDiaTipoChart({ data }: { data: TmrDiaTipo[] }) {
  if (!data.length) return null

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">TMR executado por dia e tipo</h3>
        <p className="text-sm text-muted-foreground">
          Duração média real por dia da semana da coleta, segmentada entre D-1 e W-1
        </p>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="diaSemana" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => formatMinutes(Number(value))}
            width={56}
          />
          <Tooltip content={<TmrTooltip />} cursor={{ fill: "var(--secondary)" }} />
          <Legend />
          <Bar dataKey="d1Min" name="D-1" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={56} />
            <Bar dataKey="w1Min" name="W-1" fill="var(--warning)" radius={[6, 6, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
