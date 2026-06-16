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
 *   - GCP_SERVICE_ACCOUNT_KEY : JSON completo da service account (string).
 *   - ROUTING_CLOCK_SHEET_ID  : ID da planilha (o trecho entre /d/ e /edit na URL).
 *   - ROUTING_CLOCK_SHEET_RANGE (opcional) : ex. "Sheet1!A:M". Default: primeira aba inteira.
 *
 * A planilha deve estar compartilhada (leitura) com o e-mail da service account.
 * A primeira linha precisa conter os cabeçalhos com os mesmos nomes das colunas da query.
 */

export function isSheetsConfigured(): boolean {
  return !!process.env.GCP_SERVICE_ACCOUNT_KEY && !!process.env.ROUTING_CLOCK_SHEET_ID
}

function getCredentials(): Record<string, unknown> | null {
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // Suporta chave com \n escapados (comum ao colar em env var).
    try {
      return JSON.parse(raw.replace(/\\n/g, "\n"))
    } catch {
      return null
    }
  }
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

/** Busca as linhas do Routing Clock a partir do Google Sheet configurado. */
export async function fetchRowsFromSheet(): Promise<RawRoutingOrder[]> {
  const credentials = getCredentials()
  const sheetId = process.env.ROUTING_CLOCK_SHEET_ID
  if (!credentials || !sheetId) {
    throw new Error("Google Sheets não configurado (GCP_SERVICE_ACCOUNT_KEY / ROUTING_CLOCK_SHEET_ID)")
  }

  const range = process.env.ROUTING_CLOCK_SHEET_RANGE || "A:M"
  const token = await getAccessToken(credentials)

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
