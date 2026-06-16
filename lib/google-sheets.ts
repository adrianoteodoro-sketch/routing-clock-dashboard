import { GoogleAuth } from "google-auth-library"
import type { PlanificationType, RawRoutingOrder } from "./types"

/**
 * Leitura automatizada do Routing Clock First Mile a partir de um Google Sheet.
 *
 * Pipeline recomendado (totalmente automático):
 *   BigQuery (scheduled query / Connected Sheets) -> Google Sheet -> este app.
 *
 * A planilha NÃO fica atrás do VPC Service Controls, então funciona em qualquer
 * deploy (Vercel/preview), diferente da conexão direta ao meli-bi-data.
 *
 * Variáveis de ambiente necessárias:
 *   - GCP_CLIENT_EMAIL  : client_email da service account.
 *   - GCP_PRIVATE_KEY   : private_key da service account.
 *   - GOOGLE_SHEET_ID   : ID da planilha (aceita também a URL completa).
 *   - GOOGLE_SHEET_RANGE (opcional) : ex. "Página1!A:Z". Default: primeira aba inteira (A:Z).
 *
 * A planilha deve estar compartilhada (leitura) com o e-mail da service account.
 * A primeira linha precisa conter os cabeçalhos com os mesmos nomes das colunas da query.
 */

export function isSheetsConfigured(): boolean {
  return (
    !!process.env.GOOGLE_SHEET_ID &&
    !!process.env.GCP_CLIENT_EMAIL &&
    !!process.env.GCP_PRIVATE_KEY
  )
}

/**
 * Extrai o ID da planilha. Aceita o ID puro OU a URL completa
 * (https://docs.google.com/spreadsheets/d/<ID>/edit...).
 */
function extractSheetId(raw: string): string {
  const v = (raw || "").trim()
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (m) return m[1]
  return v
}

/**
 * Monta a credencial a partir de GCP_CLIENT_EMAIL + GCP_PRIVATE_KEY.
 * Também aceita o JSON completo em GCP_SERVICE_ACCOUNT_KEY (compatibilidade).
 */
function getCredentials(): { client_email: string; private_key: string } | null {
  const email = process.env.GCP_CLIENT_EMAIL
  const key = process.env.GCP_PRIVATE_KEY
  if (email && key) {
    return { client_email: email.trim(), private_key: key.replace(/\\n/g, "\n") }
  }
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return { client_email: parsed.client_email, private_key: String(parsed.private_key).replace(/\\n/g, "\n") }
    } catch {
      try {
        const parsed = JSON.parse(raw.replace(/\\n/g, "\n"))
        return { client_email: parsed.client_email, private_key: parsed.private_key }
      } catch {
        return null
      }
    }
  }
  return null
}

async function getAccessToken(credentials: Record<string, unknown>): Promise<string> {
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error("Não foi possível obter access token da service account")
  return token.token
}

/** Normaliza uma data para YYYY-MM-DD, aceitando YYYY-MM-DD ou DD/MM/AAAA. */
function normalizeDate(value: string): string {
  const v = (value || "").trim()
  if (!v) return ""
  // já no formato ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  // DD/MM/AAAA ou D/M/AAAA
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) {
    const [, d, m, y] = br
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return v
}

/** Normaliza um horário para HH:MM:SS (aceita HH:MM ou HH:MM:SS). */
function normalizeTime(value: string): string {
  const v = (value || "").trim()
  if (!v) return "00:00:00"
  const parts = v.split(":")
  const [h = "0", m = "0", s = "0"] = parts
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`
}

/** Normaliza HH:MM (duração / TMR). */
function normalizeHHMM(value: string): string {
  const v = (value || "").trim()
  if (!v) return "00:00"
  const [h = "0", m = "0"] = v.split(":")
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, "_")
}

/** Converte a matriz de valores da planilha em RawRoutingOrder[]. */
function parseValues(values: string[][]): RawRoutingOrder[] {
  if (!values || values.length < 2) return []
  const header = values[0].map(norm)
  const idx = (name: string) => header.indexOf(norm(name))

  const iCreatedDate = idx("created_date")
  const iCreatedTime = idx("created_time")
  const iUpdatedDate = idx("updated_date")
  const iUpdatedTime = idx("updated_time")
  const iTimeToUpdate = idx("time_to_update")
  const iFacility = idx("SHP_FACILITY_ID")
  const iRegional = idx("Regional")
  const iPlanDate = idx("RTG_ORD_PLAN_LOCAL_DATE")
  const iStatus = idx("RTG_ORD_STATUS")
  const iPlanType = idx("planification_type")
  const iTmr = idx("TMR_Routing")
  const iTmr30 = idx("TMR_Routing_30pct")

  const rows: RawRoutingOrder[] = []
  for (let r = 1; r < values.length; r++) {
    const row = values[r]
    if (!row || row.length === 0) continue
    const facility = (row[iFacility] ?? "").trim()
    if (!facility) continue

    const planType = ((row[iPlanType] ?? "").trim() || "tactical") as PlanificationType

    rows.push({
      created_date: normalizeDate(row[iCreatedDate] ?? ""),
      created_time: normalizeTime(row[iCreatedTime] ?? ""),
      updated_date: normalizeDate(row[iUpdatedDate] ?? ""),
      updated_time: normalizeTime(row[iUpdatedTime] ?? ""),
      time_to_update: normalizeHHMM(row[iTimeToUpdate] ?? ""),
      SHP_FACILITY_ID: facility,
      Regional: (row[iRegional] ?? "").trim() || "OUTROS",
      RTG_ORD_PLAN_LOCAL_DATE: normalizeDate(row[iPlanDate] ?? ""),
      RTG_ORD_STATUS: (row[iStatus] ?? "").trim(),
      date_created: normalizeDate(row[iCreatedDate] ?? ""),
      planification_type: planType,
      TMR_Routing: normalizeHHMM(row[iTmr] ?? ""),
      TMR_Routing_30pct: normalizeHHMM(row[iTmr30] ?? ""),
    })
  }
  return rows
}

/**
 * Descobre a primeira aba LEGÍVEL da planilha. Abas do tipo DATA_SOURCE
 * (Connected Sheets ligadas ao BigQuery) não podem ser lidas via values.get,
 * então são ignoradas — pegamos a primeira aba do tipo GRID.
 */
async function getReadableSheetTitle(sheetId: string, token: string): Promise<string> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `?fields=sheets.properties(title,sheetType)`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API (metadata) ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    sheets?: { properties?: { title?: string; sheetType?: string } }[]
  }
  const sheets = json.sheets ?? []
  const grid = sheets.find((s) => s.properties?.sheetType === "GRID" && s.properties?.title)
  const title = grid?.properties?.title ?? sheets[0]?.properties?.title
  if (!title) throw new Error("Planilha sem abas legíveis")
  return title
}

/** Busca as linhas do Routing Clock a partir do Google Sheet configurado. */
export async function fetchRowsFromSheet(): Promise<RawRoutingOrder[]> {
  const credentials = getCredentials()
  const rawId = process.env.GOOGLE_SHEET_ID
  if (!credentials || !rawId) {
    throw new Error("Google Sheets não configurado (GOOGLE_SHEET_ID / GCP_CLIENT_EMAIL / GCP_PRIVATE_KEY)")
  }

  const sheetId = extractSheetId(rawId)
  const token = await getAccessToken(credentials)

  // O range precisa conter o nome da aba (ex.: "Página1!A:Z"). Se a env não trouxer
  // uma aba explícita, descobrimos o título da primeira aba automaticamente.
  const rawRange = (process.env.GOOGLE_SHEET_RANGE || "").trim()
  let range: string
  if (rawRange.includes("!")) {
    range = rawRange
  } else {
    const firstTab = await getReadableSheetTitle(sheetId, token)
    // Nome da aba escapado com aspas simples (seguro p/ espaços e nomes reservados).
    range = `'${firstTab.replace(/'/g, "''")}'!A:Z`
  }

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = (await res.json()) as { values?: string[][] }
  return parseValues(json.values ?? [])
}
