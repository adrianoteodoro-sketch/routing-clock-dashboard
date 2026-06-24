"use client"

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import type { PerfPorTipo } from "@/lib/types"

const SUCCESS = "oklch(0.62 0.17 155)"
const DANGER = "oklch(0.58 0.23 18)"
const MUTED = "oklch(0.55 0.02 257)"

const TIPO_LABEL: Record<string, string> = {
  "W-1": "W-1 (Tático)",
  "D-1": "D-1 (Replanejamento)",
  "D-2": "D-2 (Longa distância)",
}

function ValueLabel(props: any) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const value = Number(props.value ?? 0)
  const label = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dominantBaseline="middle"
      className="fill-foreground text-xs font-bold"
    >
      {`${label}%`}
    </text>
  )
}

export function TipoPerformanceChart({ data, meta }: { data: PerfPorTipo[]; meta: number }) {
  const rows = data.map((d) => ({
    ...d,
    nome: TIPO_LABEL[d.tipo] ?? d.tipo,
  }))

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Performance por Roteirização</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Comparativo de aderência entre W-1, D-1 e D-2 (linha = meta {Number.isInteger(meta) ? meta : meta.toFixed(1)}%)
      </p>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 12, right: 56, left: 8, bottom: 12 }}
          barCategoryGap={24}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="nome"
            tickLine={false}
            axisLine={false}
            width={140}
            tick={{ fill: MUTED, fontSize: 12, fontWeight: 600 }}
          />
          <ReferenceLine
            x={meta}
            stroke={MUTED}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: "Meta", position: "top", fill: MUTED, fontSize: 11, fontWeight: 700 }}
          />
          <Bar dataKey="performance" radius={[0, 4, 4, 0]} maxBarSize={48}>
            <LabelList dataKey="performance" content={(props) => <ValueLabel {...props} />} />
            {rows.map((r, i) => (
              <Cell key={i} fill={r.performance >= r.meta ? SUCCESS : DANGER} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {rows.map((r) => (
          <span key={r.tipo} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: r.performance >= r.meta ? SUCCESS : DANGER }}
            />
            {r.tipo}: {r.volume.toLocaleString("pt-BR")} roteiros
          </span>
        ))}
      </div>
    </div>
  )
}
