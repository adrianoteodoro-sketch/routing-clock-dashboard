import type { RawRoutingOrder } from "./types"
import { generateMockRows } from "./mock-data"
import { fetchRowsFromSheet, isSheetsConfigured } from "./google-sheets"

// Query do Routing Clock First Mile (BT_SHP_LG_RTG_ORDER + LK_SHP_FACILITIES).
// Mantida aqui para rodar quando o deploy estiver DENTRO do perímetro VPC do meli-bi-data.
export const ROUTING_CLOCK_QUERY = `
SELECT
    DATE(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_DATE_CREATED_DTTM)) AS created_date,
    TIME(DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_DATE_CREATED_DTTM), SECOND)) AS created_time,
    DATE(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_LAST_UPDATED_DTTM)) AS updated_date,
    TIME(DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_LAST_UPDATED_DTTM), SECOND)) AS updated_time,
    CONCAT(
        LPAD(CAST(DIV(ro.total_minutes, 60) AS STRING), 2, '0'), ':',
        LPAD(CAST(MOD(ro.total_minutes, 60) AS STRING), 2, '0')
    ) AS time_to_update,
    ro.SHP_FACILITY_ID,
    CASE ro.SHP_FACILITY_ID
        WHEN 'XSP4'     THEN 'MEGAS'
        WHEN 'BRXSP16'  THEN 'MEGAS'
        WHEN 'ARENA'    THEN 'MEGAS'
        WHEN 'BRXSP10'  THEN 'MEGAS'
        WHEN 'BRXSP18'  THEN 'MEGAS'
        WHEN 'BRXSP6'   THEN 'MEGAS'
        WHEN 'BRXBA1'   THEN 'NONECO'
        WHEN 'BRXPE1'   THEN 'NONECO'
        WHEN 'BRXCE1'   THEN 'NONECO'
        WHEN 'BRXGO1'   THEN 'NONECO'
        WHEN 'BRXES1'   THEN 'RIMES'
        WHEN 'BRXMG2'   THEN 'RIMES'
        WHEN 'XMG1'     THEN 'RIMES'
        WHEN 'BRRJ02'   THEN 'RIMES'
        WHEN 'BRXSP7'   THEN 'SPIO'
        WHEN 'BRXPR2'   THEN 'SPIO'
        WHEN 'BRXSP14'  THEN 'SPIO'
        WHEN 'BRXMG3'   THEN 'SPIO'
        WHEN 'BRXSP11'  THEN 'SPIO'
        WHEN 'BRXPR4'   THEN 'SPIO'
        WHEN 'CAMPINAS' THEN 'SPIO'
        WHEN 'BRXSP5'   THEN 'SPIO'
        WHEN 'BRPR01'   THEN 'SUL'
        WHEN 'BRXSC2'   THEN 'SUL'
        WHEN 'BRXPR3'   THEN 'SUL'
        WHEN 'BRXRS1'   THEN 'SUL'
        ELSE 'OUTROS'
    END AS Regional,
    ro.RTG_ORD_PLAN_LOCAL_DATE,
    ro.RTG_ORD_STATUS,
    DATE(ro.RTG_ORD_DATE_CREATED_DTTM) AS date_created,
    JSON_VALUE(ro.RTG_ORD_TAGS, '$.planification_type') AS planification_type,
    -- TMR por facility sem acréscimo
    CONCAT(
        LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0'), ':',
        LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0')
    ) AS TMR_Routing,
    -- TMR executado por facility (aproximação: média +30%). Fonte real é a planilha (TMR_Routing_Exec).
    CONCAT(
        LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0'), ':',
        LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0')
    ) AS TMR_Routing_Exec
FROM (
    SELECT
        ro.*, f.SHP_TIMEZONE_ID,
        DATETIME_DIFF(
            DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_LAST_UPDATED_DTTM), SECOND),
            DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(f.SHP_TIMEZONE_ID, ro.RTG_ORD_DATE_CREATED_DTTM), SECOND),
            MINUTE
        ) AS total_minutes
    FROM \`meli-bi-data.WHOWNER.BT_SHP_LG_RTG_ORDER\` AS ro
    LEFT JOIN \`meli-bi-data.WHOWNER.LK_SHP_FACILITIES\` AS f ON ro.SHP_FACILITY_ID = f.SHP_FACILITY_ID
    WHERE ro.RTG_ORD_PLAN_LOCAL_DATE > "2026-01-01"
      AND ro.RTG_ORD_MILE_TYPE = "first_mile"
      AND ro.RTG_ORD_STATUS != "deleted"
      AND ro.SIT_SITE_ID = "MLB"
      AND ro.RTG_ORD_PREFIX != "RUTEO"
      AND JSON_VALUE(ro.RTG_ORD_TAGS, '$.planification_type') IN ('tactical', 'replanning')
) AS ro
LEFT JOIN \`meli-bi-data.WHOWNER.LK_SHP_FACILITIES\` AS f ON ro.SHP_FACILITY_ID = f.SHP_FACILITY_ID
`

/**
 * O cliente do BigQuery devolve DATE/TIME/DATETIME como objetos { value: "..." }.
 * Convertendo tudo para string simples, como a lógica de cálculo espera.
 */
function bqValue(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return String((v as { value: unknown }).value ?? "")
  }
  return String(v)
}

function normalizeBigQueryRow(row: Record<string, unknown>): RawRoutingOrder {
  return {
    created_date: bqValue(row.created_date),
    date_created: bqValue(row.date_created),
    created_time: bqValue(row.created_time),
    updated_date: bqValue(row.updated_date),
    updated_time: bqValue(row.updated_time),
    time_to_update: bqValue(row.time_to_update),
    SHP_FACILITY_ID: bqValue(row.SHP_FACILITY_ID),
    Regional: bqValue(row.Regional),
    RTG_ORD_PLAN_LOCAL_DATE: bqValue(row.RTG_ORD_PLAN_LOCAL_DATE),
    RTG_ORD_STATUS: bqValue(row.RTG_ORD_STATUS),
    planification_type: bqValue(row.planification_type) as RawRoutingOrder["planification_type"],
    TMR_Routing: bqValue(row.TMR_Routing),
    TMR_Routing_Exec: bqValue(row.TMR_Routing_Exec),
  }
}

/**
 * Busca as linhas do Routing Clock First Mile. Ordem de prioridade:
 *   1. Google Sheet (pipeline automatizado, recomendado) — funciona fora do VPC.
 *   2. Conexão direta ao BigQuery — só dentro do perímetro VPC do meli-bi-data.
 *   3. Dados mock — preview do v0 / sem nenhuma configuração.
 */
export async function fetchRoutingOrders(): Promise<{
  rows: RawRoutingOrder[]
  fonte: "bigquery" | "sheets" | "mock"
}> {
  // 1) Google Sheet (caminho automatizado preferido)
  if (isSheetsConfigured()) {
    try {
      const rows = await fetchRowsFromSheet()
      if (rows.length > 0) return { rows, fonte: "sheets" }
      console.log("[v0] Google Sheet vazio ou sem linhas válidas, tentando próxima fonte.")
    } catch (error) {
      console.log("[v0] Falha ao ler Google Sheet:", (error as Error).message)
    }
  }

  // 2) Conexão direta ao BigQuery (dentro do perímetro VPC)
  const hasBigQueryCredentials =
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (!!process.env.GCP_SERVICE_ACCOUNT_KEY && !!process.env.BIGQUERY_PROJECT_ID)

  if (!hasBigQueryCredentials) {
    return { rows: generateMockRows(), fonte: "mock" }
  }

  try {
    // Import dinâmico para não quebrar o build/preview quando a lib não é usada.
    const { BigQuery } = await import("@google-cloud/bigquery")

    const credentials = process.env.GCP_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY)
      : undefined

    const bq = new BigQuery({
      projectId: process.env.BIGQUERY_PROJECT_ID,
      ...(credentials ? { credentials } : {}),
    })

    const [job] = await bq.createQueryJob({ query: ROUTING_CLOCK_QUERY, location: "US" })
    const [rawRows] = await job.getQueryResults()

    const rows = (rawRows as Record<string, unknown>[]).map(normalizeBigQueryRow)

    return { rows, fonte: "bigquery" }
  } catch (error) {
    console.log("[v0] Falha ao consultar BigQuery, usando mock:", (error as Error).message)
    return { rows: generateMockRows(), fonte: "mock" }
  }
}
