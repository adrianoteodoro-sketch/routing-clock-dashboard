import { type NextRequest, NextResponse } from "next/server"
import { fetchRoutingOrders } from "@/lib/bigquery"
import { buildFaro } from "@/lib/faro"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Data de hoje em YYYY-MM-DD no fuso do servidor (usada como default). */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || todayISO()
  try {
    const { rows, fonte } = await fetchRoutingOrders()
    const data = buildFaro(rows, date, fonte)
    return NextResponse.json(data)
  } catch (error) {
    console.log("[v0] Erro na API faro:", (error as Error).message)
    return NextResponse.json({ error: "Falha ao carregar o Faro" }, { status: 500 })
  }
}
