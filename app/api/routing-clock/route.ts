import { type NextRequest, NextResponse } from "next/server"
import { fetchRoutingOrders } from "@/lib/bigquery"
import { buildDashboard, processRows } from "@/lib/routing-clock"
import type { Filters } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const filters: Filters = {
    regional: sp.get("regional") ?? "TODAS",
    mes: sp.get("mes") ?? "TODOS",
    semana: sp.get("semana") ?? "TODAS",
    rotInicio: sp.get("rotInicio") ?? "",
    rotFim: sp.get("rotFim") ?? "",
    coletaInicio: sp.get("coletaInicio") ?? "",
    coletaFim: sp.get("coletaFim") ?? "",
  }

  try {
    const { rows, fonte } = await fetchRoutingOrders()
    const orders = processRows(rows)
    const data = buildDashboard(orders, filters, fonte)
    return NextResponse.json(data)
  } catch (error) {
    console.log("[v0] Erro na API routing-clock:", (error as Error).message)
    return NextResponse.json({ error: "Falha ao carregar dados" }, { status: 500 })
  }
}
