import { type NextRequest, NextResponse } from "next/server"
import { getSheetRefreshStatus, triggerSheetRefresh } from "@/lib/google-sheets"

export const dynamic = "force-dynamic"
// Endpoints curtos (apenas disparam/consultam). O polling fica no cliente.
export const maxDuration = 30

/**
 * Refresh assíncrono da Connected Sheet (BigQuery -> Sheet):
 *   GET ?action=trigger          -> dispara o refresh e devolve a assinatura base.
 *   GET ?action=status&sig=<...> -> informa se a nova execução já concluiu.
 *
 * O cliente dispara, faz polling do status e só então rebusca os dados.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const action = sp.get("action") ?? "trigger"

  try {
    if (action === "status") {
      const sig = sp.get("sig") ?? ""
      const status = await getSheetRefreshStatus(sig)
      return NextResponse.json(status)
    }

    // action === "trigger"
    const result = await triggerSheetRefresh()
    return NextResponse.json(result)
  } catch (error) {
    console.log("[v0] Erro no refresh da Connected Sheet:", (error as Error).message)
    return NextResponse.json({ error: "Falha ao atualizar a planilha" }, { status: 500 })
  }
}
