// app/api/refresh/route.ts
// Next.js App Router — POST /api/refresh
//
// Executa as queries do BigQuery e atualiza as abas correspondentes no Google Sheets.
//
// Dependências:
//   npm install @google-cloud/bigquery googleapis
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GOOGLE_SHEET_ID              — ID da planilha (da URL do Sheets)
//   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON completo da service account (stringify)
//
// Permissões necessárias na service account:
//   - roles/bigquery.jobUser + roles/bigquery.dataViewer no projeto meli-bi-data
//   - Compartilhe a planilha como Editor com o e-mail da service account

import { BigQuery }  from '@google-cloud/bigquery';
import { google }    from 'googleapis';

// ─── Configuração ────────────────────────────────────────────────────────────

const SHEET_ID     = process.env.GOOGLE_SHEET_ID!;
const BQ_PROJECT   = 'meli-bi-data';
const BQ_LOCATION  = 'US';
const MAX_BQ_ROWS  = 10_000;   // limite de segurança por query
const MAX_BQ_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB billing cap

// ─── Queries ─────────────────────────────────────────────────────────────────
// Para adicionar uma nova query: copie o padrão abaixo e acrescente ao array PIPELINES.

interface Pipeline {
  /** Nome da aba no Google Sheets (exatamente como aparece na tab) */
  sheetTab: string;
  /** Célula inicial onde os dados serão gravados (cabeçalho na linha 1) */
  startCell: string;
  /** SQL SELECT a executar no BigQuery */
  query: string;
}

const PIPELINES: Pipeline[] = [
  // ── 1. Routing Orders ──────────────────────────────────────────────────────
  {
    sheetTab:  'Query',
    startCell: 'A1',
    query: `
SELECT
    DATE(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_DATE_CREATED_DTTM)) AS created_date,
    TIME(DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_DATE_CREATED_DTTM), SECOND)) AS created_time,
    DATE(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_LAST_UPDATED_DTTM)) AS updated_date,
    TIME(DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_LAST_UPDATED_DTTM), SECOND)) AS updated_time,
    CONCAT(LPAD(CAST(DIV(ro.total_minutes, 60) AS STRING), 2, '0'), ':', LPAD(CAST(MOD(ro.total_minutes, 60) AS STRING), 2, '0')) AS time_to_update,
    ro.SHP_FACILITY_ID,
    CASE ro.SHP_FACILITY_ID
        WHEN 'XSP4'     THEN 'MEGAS'  WHEN 'BRXSP16'  THEN 'MEGAS'  WHEN 'ARENA'    THEN 'MEGAS'
        WHEN 'BRXSP10'  THEN 'MEGAS'  WHEN 'BRXSP18'  THEN 'MEGAS'  WHEN 'BRXSP6'   THEN 'MEGAS'
        WHEN 'BRXBA1'   THEN 'NONECO' WHEN 'BRXPE1'   THEN 'NONECO' WHEN 'BRXCE1'   THEN 'NONECO' WHEN 'BRXGO1' THEN 'NONECO'
        WHEN 'BRXES1'   THEN 'RIMES'  WHEN 'BRXMG2'   THEN 'RIMES'  WHEN 'XMG1'     THEN 'RIMES'  WHEN 'BRRJ02' THEN 'RIMES'
        WHEN 'BRXSP7'   THEN 'SPIO'   WHEN 'BRXPR2'   THEN 'SPIO'   WHEN 'BRXSP14'  THEN 'SPIO'   WHEN 'BRXMG3' THEN 'SPIO'
        WHEN 'BRXSP11'  THEN 'SPIO'   WHEN 'BRXPR4'   THEN 'SPIO'   WHEN 'CAMPINAS'  THEN 'MEGAS'  WHEN 'BRXSP5' THEN 'SPIO'
        WHEN 'BRPR01'   THEN 'SUL'    WHEN 'BRXSC2'   THEN 'SUL'    WHEN 'BRXPR3'   THEN 'SUL'    WHEN 'BRXRS1' THEN 'SUL'
        ELSE 'OUTROS'
    END AS Regional,
    ro.RTG_ORD_PLAN_LOCAL_DATE,
    ro.RTG_ORD_STATUS,
    DATE(ro.RTG_ORD_DATE_CREATED_DTTM) AS date_created,
    JSON_VALUE(ro.RTG_ORD_TAGS, '$.planification_type') AS planification_type,
    CONCAT(LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0'), ':', LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) AS INT64), 60) AS STRING), 2, '0')) AS TMR_Routing,
    CONCAT(LPAD(CAST(DIV(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0'), ':', LPAD(CAST(MOD(CAST(AVG(ro.total_minutes) OVER (PARTITION BY ro.SHP_FACILITY_ID) * 1.3 AS INT64), 60) AS STRING), 2, '0')) AS TMR_Routing_Exec
FROM (
    SELECT ro.*, f.SHP_TIMEZONE_ID,
        DATETIME_DIFF(
            DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_LAST_UPDATED_DTTM), SECOND),
            DATETIME_TRUNC(\`meli-bi-data\`.COMMON_UDF.FN_API_TIMEZONE_CONVERT(COALESCE(f.SHP_TIMEZONE_ID, 'America/Sao_Paulo'), ro.RTG_ORD_DATE_CREATED_DTTM), SECOND),
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
    `.trim(),
  },

  // ── 2. Cross-Docking Routes (Query_XD) ────────────────────────────────────
  // Nota: os DECLARE originais foram convertidos para subexpressões inline
  // porque a API BigQuery Node.js não suporta scripts multi-statement via bq.query().
  {
    sheetTab:  'Query_XD',
    startCell: 'A1',
    query: `
WITH base_routes AS (
  SELECT
    DATE(r.MILK_RUN_DATE)          AS VIGENCIA,
    r.SITE_ID                      AS SITE_ID,
    r.CARRIER_ID                   AS ID_CARRIER,
    r.ROUTE_NAME                   AS NOME_ROTA,
    r.ROUTE_ID                     AS ROUTE_ID,
    r.STOP_SEQUENCE                AS STOP,
    r.STOP_CUSTOMER_ID             AS STOP_CUSTOMER_ID,
    r.STOP_MILK_RUN_TIME_FROM      AS START_TIME,
    r.STOP_MILK_RUN_TIME_TO        AS END_TIME,
    r.PLANNED_VEHICLE_TYPE_ID      AS VEHICLE_TYPE_ID,
    r.DISTANCE                     AS DISTANCE,
    r.ETA_DESTINATION              AS ETA,
    r.HAS_HELPER                   AS HAS_HELPER,
    r.DESTINATION_NODE.FACILITY_ID AS HUB,
    r.ZONE_IDS[SAFE_OFFSET(0)]     AS ZON_ZONE_ID,
    r.MELIONE_RELATED_LEGACY_ID    AS SVC,
    proj_id                        AS PROJECTION_ID,
    SAFE_CAST(
      REGEXP_EXTRACT(proj_id, r'^[^-]+-([^-]+)-')
      AS INT64
    )                              AS ADDRESS_ID
  FROM \`meli-bi-data.WHOWNER.BT_SHP_LOG_FMPLA_ROUTES\` r
  LEFT JOIN UNNEST(r.PROJECTION_IDS) AS proj_id
  WHERE r.LOGISTIC_TYPE = 'cross_docking'
    AND r.ROUTE_STATUS = 'active'
    AND r.STOP_SEQUENCE > 0
),
cust AS (
  SELECT SHP_LG_CUST_ID, SHP_LG_RELATED_ENTITY_ID AS ID_SELLER
  FROM \`meli-bi-data.WHOWNER.LK_SHP_LG_CUSTOMER\`
),
veh AS (
  SELECT SHP_LG_VEHICLE_TYPE_ID, SHP_LG_VEHICLE_TYPE,
         CAST(SHP_LG_VEHICLE_CAPACITY AS NUMERIC) AS VEHICLE_CAPACITY
  FROM \`meli-bi-data.WHOWNER.LK_SHP_LG_VEHICLES_TYPES\`
  WHERE SIT_SITE_ID = 'MLB'
),
carriers AS (
  SELECT SHP_COMPANY_ID, SHP_COMPANY_NAME
  FROM \`meli-bi-data.WHOWNER.LK_SHP_COMPANIES\`
  WHERE SHP_CO_SITE_ID = 'MLB'
),
zones AS (
  SELECT ZON_ZONE_ID, ZON_ZONE_NAME
  FROM \`meli-bi-data.WHOWNER.BT_SHP_MAPS_ZON_ZONES\`
  WHERE SIT_SITE_ID = 'MLB'
    AND ZON_ZONE_OWNERS = '["routing-fm"]'
),
units AS (
  SELECT
    RTG_UNIT_EXTERNAL_ID,
    ROUND(SAFE_DIVIDE(CAST(RTG_UNIT_DIMENSIONS.VOLUME AS NUMERIC), 1000000), 2) AS VOLUME,
    ROUND(SAFE_DIVIDE(CAST(RTG_UNIT_DIMENSIONS.WEIGHT AS NUMERIC), 1000), 2)    AS PESO,
    SAFE_CAST(JSON_VALUE(RTG_UNIT_METADATA, '$.estimated_packages') AS INT64)   AS PACOTES
  FROM \`meli-bi-data.WHOWNER.BT_SHP_LG_RTG_PLANIFICATION_UNIT\`
  WHERE SIT_SITE_ID = 'MLB'
    AND SHP_FACILITY_TYPE = 'cross_docking'
),
base_calc AS (
  SELECT
    r.VIGENCIA, r.SITE_ID, r.ID_CARRIER, r.NOME_ROTA, r.ROUTE_ID, r.STOP,
    c.ID_SELLER, r.HUB, r.START_TIME, r.END_TIME,
    v.SHP_LG_VEHICLE_TYPE AS VEICULO,
    v.VEHICLE_CAPACITY,
    ROUND(r.DISTANCE) AS KM,
    co.SHP_COMPANY_NAME AS TRANSPORTADOR,
    r.ETA, r.HAS_HELPER, r.ZON_ZONE_ID,
    z.ZON_ZONE_NAME AS CLUSTER,
    SAFE_DIVIDE(u.VOLUME,  COUNT(*) OVER (PARTITION BY c.ID_SELLER, r.VIGENCIA)) AS VOLUME_LINHA,
    SAFE_DIVIDE(u.PESO,    COUNT(*) OVER (PARTITION BY c.ID_SELLER, r.VIGENCIA)) AS PESO_LINHA,
    SAFE_DIVIDE(u.PACOTES, COUNT(*) OVER (PARTITION BY c.ID_SELLER, r.VIGENCIA)) AS PACOTES_LINHA
  FROM base_routes r
  LEFT JOIN cust     c  ON r.STOP_CUSTOMER_ID       = c.SHP_LG_CUST_ID
  LEFT JOIN units    u  ON u.RTG_UNIT_EXTERNAL_ID   = r.PROJECTION_ID
  LEFT JOIN veh      v  ON v.SHP_LG_VEHICLE_TYPE_ID = r.VEHICLE_TYPE_ID
  LEFT JOIN carriers co ON co.SHP_COMPANY_ID         = r.ID_CARRIER
  LEFT JOIN zones    z  ON CAST(z.ZON_ZONE_ID AS STRING) = CAST(r.ZON_ZONE_ID AS STRING)
),
route_agg AS (
  SELECT
    VIGENCIA, SITE_ID, ID_CARRIER, NOME_ROTA, HUB,
    MAX(VEICULO)         AS VEICULO,
    MAX(KM)              AS KM,
    MAX(TRANSPORTADOR)   AS TRANSPORTADOR,
    MAX(ETA)             AS ETA,
    MIN(START_TIME)      AS START_TIME,
    MAX(HAS_HELPER)      AS HAS_HELPER,
    MAX(ZON_ZONE_ID)     AS ZON_ZONE_ID,
    MAX(CLUSTER)         AS CLUSTER,
    MAX(VEHICLE_CAPACITY)AS VEHICLE_CAPACITY,
    COUNT(DISTINCT STOP) AS TOTAL_STOPS,
    SUM(VOLUME_LINHA)    AS VOLUME_TOTAL,
    SUM(PESO_LINHA)      AS PESO_TOTAL,
    SUM(PACOTES_LINHA)   AS PACOTES_TOTAL
  FROM base_calc
  GROUP BY VIGENCIA, SITE_ID, ID_CARRIER, NOME_ROTA, HUB
),
final AS (
  SELECT
    ra.VIGENCIA, ra.SITE_ID, ra.ID_CARRIER, ra.NOME_ROTA, ra.HUB,
    ra.VEICULO,
    ra.KM,
    ra.TRANSPORTADOR,
    ra.ETA,
    TIME_ADD(TIME '00:00:00', INTERVAL TIME_DIFF(ra.ETA, ra.START_TIME, MINUTE) MINUTE) AS ORH,
    CASE WHEN ra.HAS_HELPER = FALSE THEN 'NÃO' ELSE 'SIM' END AS AJUDANTE,
    ra.ZON_ZONE_ID,
    ra.CLUSTER,
    ra.TOTAL_STOPS,
    REPLACE(FORMAT('%.2f', ROUND(ra.VOLUME_TOTAL,  2)), '.', ',') AS VOLUME,
    REPLACE(FORMAT('%.2f', ROUND(ra.PESO_TOTAL,    2)), '.', ',') AS PESO,
    CAST(ROUND(ra.PACOTES_TOTAL, 0) AS INT64)                     AS PACOTES
  FROM route_agg ra
)
SELECT *
FROM final
WHERE VIGENCIA BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
                   AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
  AND SITE_ID = 'MLB'
  AND HUB IN (
    'CAMPINAS','ARENA','BRXBA1','BRXSP7','XPR1','BRXES1','BRXMG2','BRXSP10',
    'BRXSP16','BRXPR2','BRXSP14','XMG1','BRXPE1','BRXSP5','BRRJ02','XSP4',
    'BRXSP11','BRXSC2','BRXPR3','BRXCE1','BRXGO1','BRXRS1','BRXPR4','BRXMG3','BRXSP18'
  )
ORDER BY HUB, NOME_ROTA
    `.trim(),
  },

  // ── 3. Adicionar mais pipelines aqui ──────────────────────────────────────
  // {
  //   sheetTab:  'NomeDaAba',
  //   startCell: 'A1',
  //   query: `SELECT ...`,
  // },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCredentials() {
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
}

function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/** Executa uma query no BigQuery e retorna array 2D [headers, ...rows] */
async function runBigQuery(sql: string): Promise<string[][]> {
  const bq = new BigQuery({
    projectId: BQ_PROJECT,
    credentials: getCredentials(),
  });

  const [rows] = await bq.query({
    query: sql,
    location: BQ_LOCATION,
    maximumBytesBilled: String(MAX_BQ_BYTES),
  });

  if (rows.length === 0) return [['(sem resultados)']];

  const headers = Object.keys(rows[0]);
  const data = rows.slice(0, MAX_BQ_ROWS).map((row: Record<string, unknown>) =>
    headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        // BigQuery DATE/TIME/DATETIME retornam objetos com .value
        if ('value' in (v as object)) return String((v as { value: unknown }).value);
        return JSON.stringify(v);
      }
      return String(v);
    })
  );

  return [headers, ...data];
}

/** Limpa a aba e grava os dados a partir de startCell */
async function writeToSheet(
  sheetsClient: ReturnType<typeof google.sheets>,
  tab: string,
  startCell: string,
  values: string[][]
): Promise<{ updatedRows: number; updatedCells: number }> {
  // 1. Limpa a aba inteira para não deixar dados órfãos
  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: tab,
  });

  // 2. Grava os novos dados
  const res = await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${startCell}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return {
    updatedRows:  res.data.updatedRows  ?? 0,
    updatedCells: res.data.updatedCells ?? 0,
  };
}

// ─── Handler HTTP ─────────────────────────────────────────────────────────────

export async function POST() {
  if (!SHEET_ID) {
    return Response.json({ error: 'GOOGLE_SHEET_ID não configurado' }, { status: 500 });
  }

  const auth = getGoogleAuth();
  const sheetsClient = google.sheets({ version: 'v4', auth: await auth.getClient() as any });

  const results: Array<{
    tab: string;
    status: 'ok' | 'error';
    rows?: number;
    cells?: number;
    error?: string;
    durationMs?: number;
  }> = [];

  // Executa cada pipeline em sequência para evitar concorrência no BigQuery
  for (const pipeline of PIPELINES) {
    const t0 = Date.now();
    try {
      const data = await runBigQuery(pipeline.query);
      const { updatedRows, updatedCells } = await writeToSheet(
        sheetsClient,
        pipeline.sheetTab,
        pipeline.startCell,
        data
      );
      results.push({
        tab:        pipeline.sheetTab,
        status:     'ok',
        rows:       updatedRows,
        cells:      updatedCells,
        durationMs: Date.now() - t0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[refresh] Erro na aba "${pipeline.sheetTab}":`, message);
      results.push({
        tab:        pipeline.sheetTab,
        status:     'error',
        error:      message,
        durationMs: Date.now() - t0,
      });
      // Continua com os próximos pipelines mesmo se um falhar
    }
  }

  const hasErrors = results.some((r) => r.status === 'error');
  return Response.json(
    {
      success:     !hasErrors,
      refreshedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      results,
    },
    { status: hasErrors ? 207 : 200 }  // 207 Multi-Status se houver erros parciais
  );
}
