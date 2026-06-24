import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Endpoint de diagnóstico para validar acesso direto ao BigQuery (meli-bi-data).
// Não altera o pipeline de dados do dashboard — serve apenas para testar se um
// service_account já consegue atravessar o perímetro VPC Service Controls.
//
// Use ?sa=1 para testar GCP_SERVICE_ACCOUNT_KEY (padrão) ou ?sa=2 para
// testar GCP_SERVICE_ACCOUNT_KEY_2 (o novo service_account).

type Diagnosis =
  | "success"
  | "vpc_service_controls_blocked"
  | "permission_denied"
  | "invalid_credentials"
  | "missing_credentials"
  | "unknown_error"

function classifyError(message: string): Diagnosis {
  const m = message.toLowerCase()
  if (m.includes("vpcservicecontrols") || m.includes("request is prohibited by organization") || m.includes("security perimeter")) {
    return "vpc_service_controls_blocked"
  }
  if (m.includes("permission") || m.includes("access denied") || m.includes("does not have bigquery") || m.includes("403")) {
    return "permission_denied"
  }
  if (m.includes("invalid") && (m.includes("credential") || m.includes("key") || m.includes("jwt") || m.includes("json"))) {
    return "invalid_credentials"
  }
  return "unknown_error"
}

const ADVICE: Record<Diagnosis, string> = {
  success: "O service_account consegue consultar o BigQuery diretamente. Podemos migrar o pipeline para a query direta.",
  vpc_service_controls_blocked:
    "O perímetro VPC Service Controls está bloqueando o acesso pela origem de rede (Vercel). É preciso o time dono do meli-bi-data criar uma ingress policy / access level liberando este service_account a partir da Vercel, ou usar um proxy dentro da VPC. Não é problema de código nem de permissão IAM.",
  permission_denied:
    "O service_account atravessou a rede, mas não tem permissão IAM. Conceda roles/bigquery.jobUser no projeto de billing e roles/bigquery.dataViewer no dataset meli-bi-data.WHOWNER.",
  invalid_credentials:
    "A credencial (GCP_SERVICE_ACCOUNT_KEY) parece inválida ou mal formatada. Verifique se colou o JSON inteiro da chave, de '{' a '}'.",
  missing_credentials:
    "As variáveis de ambiente não estão configuradas. Cadastre BIGQUERY_PROJECT_ID e a chave do service_account.",
  unknown_error: "Erro não classificado — veja a mensagem completa em 'error'.",
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const whichSa = searchParams.get("sa") === "2" ? "2" : "1"

  const keyEnvName = whichSa === "2" ? "GCP_SERVICE_ACCOUNT_KEY_2" : "GCP_SERVICE_ACCOUNT_KEY"
  const rawKey = process.env[keyEnvName]
  const projectId = process.env.BIGQUERY_PROJECT_ID

  if (!rawKey || !projectId) {
    return NextResponse.json({
      ok: false,
      diagnosis: "missing_credentials" as Diagnosis,
      keyEnvUsed: keyEnvName,
      hasKey: !!rawKey,
      hasProjectId: !!projectId,
      advice: ADVICE.missing_credentials,
    })
  }

  let credentials: Record<string, unknown>
  try {
    credentials = JSON.parse(rawKey)
  } catch {
    return NextResponse.json({
      ok: false,
      diagnosis: "invalid_credentials" as Diagnosis,
      keyEnvUsed: keyEnvName,
      advice: ADVICE.invalid_credentials,
    })
  }

  const startedAt = Date.now()
  try {
    const { BigQuery } = await import("@google-cloud/bigquery")
    const bq = new BigQuery({ projectId, credentials })

    // Query mínima contra a tabela real para validar acesso de fato.
    const [rows] = await bq.query({
      query:
        'SELECT COUNT(*) AS total FROM `meli-bi-data.WHOWNER.BT_SHP_LG_RTG_ORDER` WHERE RTG_ORD_PLAN_LOCAL_DATE > "2026-01-01" LIMIT 1',
    })

    return NextResponse.json({
      ok: true,
      diagnosis: "success" as Diagnosis,
      keyEnvUsed: keyEnvName,
      serviceAccountEmail: (credentials as { client_email?: string }).client_email ?? null,
      elapsedMs: Date.now() - startedAt,
      sample: rows?.[0] ?? null,
      advice: ADVICE.success,
    })
  } catch (error) {
    const message = (error as Error).message ?? String(error)
    const diagnosis = classifyError(message)
    return NextResponse.json({
      ok: false,
      diagnosis,
      keyEnvUsed: keyEnvName,
      serviceAccountEmail: (credentials as { client_email?: string }).client_email ?? null,
      elapsedMs: Date.now() - startedAt,
      advice: ADVICE[diagnosis],
      error: message,
    })
  }
}
