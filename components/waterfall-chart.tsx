"use client"

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { WaterfallPonto } from "@/lib/types"

const PRIMARY = "oklch(0.52 0.21 258)"
const DANGER = "oklch(0.58 0.23 18)"
const ANOMALIA = "oklch(0.70 0.17 55)"
const DARK = "oklch(0.21 0.04 265)"
const MUTED = "oklch(0.55 0.02 257)"

interface ChartPontoBar extends WaterfallPonto {
  base: number
  span: number
}

function buildBars(data: WaterfallPonto[]): ChartPontoBar[] {
  return data.map((p) => {
    if (p.tipo === "inicio") {
      return { ...p, base: 0, span: p.acumulado }
    }
    if (p.tipo === "total") {
      return { ...p, base: 0, span: 100 }
    }
    // perda/anomalia: barra flutuante entre acumulado anterior e atual
    const prev = p.acumulado - p.valor
    return { ...p, base: prev, span: p.valor }
  })
}

function ValueLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number; data: ChartPontoBar[] }) {
  const { index = 0, data } = props
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const p = data[index]
  if (!p) return null
  const label = p.tipo === "perda" || p.tipo === "anomalia" ? `${p.valor.toFixed(2)}%` : `${p.acumulado.toFixed(2)}%`
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" className="fill-foreground text-[11px] font-bold">
      {label}
    </text>
  )
}

export function WaterfallChart({ data }: { data: WaterfallPonto[] }) {
  const bars = buildBars(data)
  const minBase = Math.min(
    ...bars.filter((b) => b.tipo === "perda" || b.tipo === "anomalia").map((b) => b.base),
    100,
  )
  const lower = Math.max(0, Math.floor(minBase) - 1)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-bold uppercase tracking-tight text-foreground">Waterfall de Performance</h3>
      <p className="mb-3 text-sm text-muted-foreground">Decomposição das não aderências por motivo raiz</p>
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ANOMALIA }} aria-hidden />
          Atraso por motivo de anomalia
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DANGER }} aria-hidden />
          Entregue Fora do Prazo (sem anomalia)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={bars} margin={{ top: 28, right: 16, left: 0, bottom: 90 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="oklch(0.92 0.004 247)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            angle={-40}
            textAnchor="end"
            interval={0}
            height={90}
            tick={{ fill: MUTED, fontSize: 11, fontWeight: 600 }}
          />
          <YAxis
            domain={[lower, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            width={52}
          />
          {/* base invisível para empurrar a barra flutuante */}
          <Bar dataKey="base" stackId="w" fill="transparent" />
          <Bar dataKey="span" stackId="w" radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList content={(props) => <ValueLabel {...props} data={bars} />} />
            {bars.map((b, i) => (
              <Cell
                key={i}
                fill={
                  b.tipo === "inicio"
                    ? PRIMARY
                    : b.tipo === "total"
                      ? DARK
                      : b.tipo === "anomalia"
                        ? ANOMALIA
                        : DANGER
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
