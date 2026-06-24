import { type NextRequest, NextResponse } from "next/server"
import { fetchRoutingOrders } from "@/lib/bigquery"
import { fetchAnomaliasFromSheet, fetchD2RowsFromSheet, refreshSheetDataSources } from "@/lib/google-sheets"
import { buildDashboard, processD2Rows, processRows } from "@/lib/routing-clock"
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
    tipo: sp.get("tipo") ?? "TODOS",
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

    // Busca a base principal (RBM 2.0), o histórico RBM 1.0 (aba D-2) e as
    // anomalias registradas, tudo em paralelo.
    const [{ rows, fonte }, d2rows, anomalias] = await Promise.all([
      fetchRoutingOrders(),
      fetchD2RowsFromSheet().catch((e) => {
        console.log("[v0] Falha ao ler aba Routing_Clock_D-2:", (e as Error).message)
        return []
      }),
      fetchAnomaliasFromSheet().catch((e) => {
        console.log("[v0] Falha ao ler aba Anomalias:", (e as Error).message)
        return []
      }),
    ])

    // Mescla os roteiros D-2 (histórico) com a base atual para somar no volume total.
    const orders = [...processRows(rows), ...processD2Rows(d2rows)]
    const data = buildDashboard(orders, filters, fonte, anomalias)
    return NextResponse.json(data)
  } catch (error) {
    console.log("[v0] Erro na API routing-clock:", (error as Error).message)
    return NextResponse.json({ error: "Falha ao carregar dados" }, { status: 500 })
  }
}
