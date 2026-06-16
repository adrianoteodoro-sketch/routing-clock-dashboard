import type { RawRoutingOrder } from "./types"
import { generateMockRows } from "./mock-data"

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
    ro.RTG_ORD_PLAN_LOCAL_DATE,
    ro.RTG_ORD_STATUS,
    DATE(ro.RTG_ORD_DATE_CREATED_DTTM) AS date_created,
    JSON_VALUE(ro.RTG_ORD_TAGS, '$.planification_type') AS planification_type,
    -- A Regional é derivada do HUB (SHP_FACILITY_ID) no código (lib/hubs.ts).
    -- TMR por facility sem acréscimo
    CONCAT(
        LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0'), ':',
        LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0')
    ) AS TMR_Routing,
    -- TMR por facility com +30% (TMR Alvo)
    CONCAT(
        LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0'), ':',
        LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0')
    ) AS TMR_Routing_30pct
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
 * Busca as linhas do Routing Clock First Mile.
 * - Em produção (dentro do perímetro VPC, com credenciais), executa a query real.
 * - Caso contrário (preview do v0 / sem credenciais), retorna dados mock.
 */
export async function fetchRoutingOrders(): Promise<{ rows: RawRoutingOrder[]; fonte: "bigquery" | "mock" }> {
  const hasCredentials =
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !!process.env.GCP_SERVICE_ACCOUNT_KEY ||
    !!process.env.BIGQUERY_PROJECT_ID

  if (!hasCredentials) {
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
    const [rows] = await job.getQueryResults()

    return { rows: rows as RawRoutingOrder[], fonte: "bigquery" }
  } catch (error) {
    console.log("[v0] Falha ao consultar BigQuery, usando mock:", (error as Error).message)
    return { rows: generateMockRows(), fonte: "mock" }
  }
}
