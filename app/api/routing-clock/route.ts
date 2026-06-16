import { type NextRequest, NextResponse } from "next/server"
import { fetchRoutingOrders } from "@/lib/bigquery"
import { refreshSheetDataSources } from "@/lib/google-sheets"
import { buildDashboard, processRows } from "@/lib/routing-clock"
import type { Filters } from "@/lib/types"

export const dynamic = "force-dynamic"
// Refresh da Connected Sheet + re-consulta ao BigQuery pode levar dezenas de segundos.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const filters: Filters = {
    regional: sp.get("regional") ?? "TODAS",
    hub: sp.get("hub") ?? "TODOS",
    mes: sp.get("mes") ?? "TODOS",
    semana: sp.get("semana") ?? "TODAS",
    rotInicio: sp.get("rotInicio") ?? "",
    rotFim: sp.get("rotFim") ?? "",
    coletaInicio: sp.get("coletaInicio") ?? "",
    coletaFim: sp.get("coletaFim") ?? "",
  }

  try {
    // Ao clicar em "Atualizar Dados" (refresh=1), força a Connected Sheet a
    // re-consultar o BigQuery antes de ler os valores.
    if (sp.get("refresh") === "1") {
      try {
        await refreshSheetDataSources()
      } catch (e) {
        console.log("[v0] Falha ao atualizar Connected Sheet:", (e as Error).message)
      }
    }

    const { rows, fonte } = await fetchRoutingOrders()
    const orders = processRows(rows)
    const data = buildDashboard(orders, filters, fonte)
    return NextResponse.json(data)
  } catch (error) {
    console.log("[v0] Erro na API routing-clock:", (error as Error).message)
    return NextResponse.json({ error: "Falha ao carregar dados" }, { status: 500 })
  }
}
