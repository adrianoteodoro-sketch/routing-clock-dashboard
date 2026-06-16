"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  LabelList,
} from "recharts"
import type { SeriePonto } from "@/lib/types"

const PRIMARY = "oklch(0.52 0.21 258)"
const SUCCESS = "oklch(0.62 0.17 155)"
const DANGER = "oklch(0.58 0.23 18)"
const YELLOW = "oklch(0.82 0.16 85)"
const MUTED = "oklch(0.55 0.02 257)"

function yDomain(data: SeriePonto[], meta: number): [number, number] {
  const values = data.map((d) => d.performance).concat(meta)
  const min = Math.min(...values)
  const lower = Math.max(0, Math.floor(min) - 2)
  return [lower, 100]
}

function PctLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value = 0 } = props
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      className="fill-foreground text-[11px] font-bold"
    >
      {value.toFixed(2)}%
    </text>
  )
}

export function MonthlyChart({ data, meta }: { data: SeriePonto[]; meta: number }) {
  const domain = yDomain(data, meta)
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Performance Mensal</h3>
      <p className="mb-4 text-sm text-muted-foreground">Aderência ao Routing Clock por mês</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="oklch(0.92 0.004 247)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12, fontWeight: 600 }} />
          <YAxis
            domain={domain}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            width={48}
          />
          <ReferenceLine
            y={meta}
            stroke={SUCCESS}
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{ value: `META ${meta}%`, position: "right", fill: SUCCESS, fontSize: 11, fontWeight: 700 }}
          />
          <Bar dataKey="performance" radius={[6, 6, 0, 0]} maxBarSize={64}>
            <LabelList dataKey="performance" content={<PctLabel />} />
            {data.map((d, i) => (
              <Cell key={i} fill={d.performance >= meta ? PRIMARY : DANGER} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WeeklyChart({ data, meta }: { data: SeriePonto[]; meta: number }) {
  const domain = yDomain(data, meta)
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Performance Semanal</h3>
      <p className="mb-4 text-sm text-muted-foreground">Aderência e volume de roteiros por semana</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="oklch(0.92 0.004 247)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12, fontWeight: 600 }} />
          <YAxis
            yAxisId="perf"
            domain={domain}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            width={48}
          />
          <YAxis yAxisId="vol" hide domain={[0, "dataMax"]} />
          <ReferenceLine
            yAxisId="perf"
            y={meta}
            stroke={SUCCESS}
            strokeDasharray="6 4"
            strokeWidth={2}
            label={{ value: `META ${meta}%`, position: "right", fill: SUCCESS, fontSize: 11, fontWeight: 700 }}
          />
          <Bar yAxisId="perf" dataKey="performance" radius={[6, 6, 0, 0]} maxBarSize={64}>
            <LabelList dataKey="performance" content={<PctLabel />} />
            {data.map((d, i) => (
              <Cell key={i} fill={d.performance >= meta ? PRIMARY : DANGER} />
            ))}
          </Bar>
          <Line
            yAxisId="vol"
            type="monotone"
            dataKey="volume"
            stroke={YELLOW}
            strokeWidth={3}
            dot={{ r: 4, fill: YELLOW, stroke: "white", strokeWidth: 2 }}
          >
            <LabelList
              dataKey="volume"
              position="top"
              formatter={(v) => Number(v).toLocaleString("pt-BR")}
              className="fill-warning text-[10px] font-bold"
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
