import { GoogleAuth } from "google-auth-library"
import type { Anomalia, D2Row, PlanificationType, RawRoutingOrder } from "./types"
import { regionalForHub } from "./hubs"

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
  // Escopos: spreadsheets (ler valores + disparar RefreshDataSourceRequest) e
  // bigquery.readonly (a Connected Sheet re-consulta o BigQuery durante o refresh).
  const auth = new GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/bigquery.readonly",
    ],
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
  const iDateCreated = idx("date_created")
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
  const iTmrExec = idx("TMR_Routing_Exec")

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
      // Usa a coluna Regional da planilha se existir; senão deriva do HUB.
      Regional: (iRegional >= 0 ? (row[iRegional] ?? "").trim() : "") || regionalForHub(facility),
      RTG_ORD_PLAN_LOCAL_DATE: normalizeDate(row[iPlanDate] ?? ""),
      RTG_ORD_STATUS: (row[iStatus] ?? "").trim(),
      // Coluna dedicada "date_created" (data da roteirização); fallback p/ created_date.
      date_created: normalizeDate(row[iDateCreated >= 0 ? iDateCreated : iCreatedDate] ?? ""),
      planification_type: planType,
      TMR_Routing: normalizeHHMM(row[iTmr] ?? ""),
      TMR_Routing_Exec: normalizeHHMM(row[iTmrExec] ?? ""),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface DataExecState {
  state: string
  lastRefreshTime: string // RFC3339; vazio se nunca atualizado
}

/**
 * Lê o estado de execução de todas as Connected Sheets (DATA_SOURCE) da planilha,
 * incluindo o lastRefreshTime — usado para detectar quando uma NOVA execução
 * realmente concluiu (e não confundir com o SUCCEEDED de um refresh anterior).
 */
async function getDataExecutionStates(sheetId: string, token: string): Promise<DataExecState[]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `?fields=sheets.properties.dataSourceSheetProperties.dataExecutionStatus`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const json = (await res.json()) as {
    sheets?: {
      properties?: {
        dataSourceSheetProperties?: { dataExecutionStatus?: { state?: string; lastRefreshTime?: string } }
      }
    }[]
  }
  return (json.sheets ?? [])
    .map((s) => s.properties?.dataSourceSheetProperties?.dataExecutionStatus)
    .filter((st): st is { state?: string; lastRefreshTime?: string } => !!st && !!st.state)
    .map((st) => ({ state: st.state as string, lastRefreshTime: st.lastRefreshTime ?? "" }))
}

/** Junta os lastRefreshTime das fontes numa "assinatura" para detectar avanço. */
function refreshSignature(states: DataExecState[]): string {
  return states.map((s) => s.lastRefreshTime).join("|")
}

/**
 * DISPARA o refresh de TODAS as Connected Sheets (data sources) e retorna NA HORA,
 * sem aguardar a conclusão. Devolve a "assinatura" (lastRefreshTime) ANTERIOR ao
 * refresh, que o cliente usa depois para detectar quando a nova execução terminou.
 *
 * O modelo é assíncrono de propósito: o refresh do BigQuery pode levar bem mais que
 * o limite de uma função serverless, então não bloqueamos a requisição esperando.
 * Requer que a service account tenha acesso de EDITOR na planilha.
 */
export async function triggerSheetRefresh(): Promise<{
  triggered: boolean
  signature: string
  hasSources: boolean
  error?: string
}> {
  const credentials = getCredentials()
  const rawId = process.env.GOOGLE_SHEET_ID
  if (!credentials || !rawId) return { triggered: false, signature: "", hasSources: false }

  const sheetId = extractSheetId(rawId)
  const token = await getAccessToken(credentials)

  // Sem Connected Sheets não há o que atualizar.
  const before = await getDataExecutionStates(sheetId, token)
  if (before.length === 0) {
    console.log("[v0] Planilha sem Connected Sheets (data sources) para atualizar.")
    return { triggered: false, signature: "", hasSources: false }
  }

  const signature = refreshSignature(before)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ refreshDataSource: { isAll: true, force: true } }] }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Refresh data source ${res.status}: ${body.slice(0, 250)}`)
  }

  // O batchUpdate retorna 200 mesmo quando a fonte falha. É preciso inspecionar o
  // estado de cada data source no reply para saber se o refresh foi REALMENTE aceito.
  const reply = (await res.json()) as {
    replies?: { refreshDataSource?: { statuses?: { dataExecutionStatus?: { state?: string; errorMessage?: string } }[] } }[]
  }
  const statuses = (reply.replies ?? [])
    .flatMap((r) => r.refreshDataSource?.statuses ?? [])
    .map((s) => s.dataExecutionStatus)
    .filter((s): s is { state?: string; errorMessage?: string } => !!s)

  const failed = statuses.find((s) => s.state === "FAILED")
  if (failed && !statuses.some((s) => s.state === "RUNNING" || s.state === "PENDING")) {
    const raw = failed.errorMessage ?? "Falha desconhecida ao atualizar a fonte de dados."
    // O erro de VPC Service Controls é uma restrição da organização (não tem fix no app).
    const msg = raw.includes("VPC Service Controls")
      ? "O Google bloqueou a atualização da consulta ao BigQuery por uma política de VPC Service Controls da organização. " +
        "A conta de serviço usada pelo painel precisa ser autorizada no perímetro de VPC Service Controls (acesso de ingresso ao BigQuery) " +
        "pelo administrador do Google Cloud. Detalhe técnico: " +
        raw
      : raw
    console.log("[v0] Refresh da Connected Sheet FALHOU:", raw)
    return { triggered: false, signature, hasSources: true, error: msg }
  }

  console.log("[v0] Refresh das Connected Sheets disparado. Assinatura base:", signature || "(vazia)")
  return { triggered: true, signature, hasSources: true }
}

/**
 * Consulta o STATUS de um refresh em andamento, comparando com a assinatura base.
 * done = a assinatura avançou (nova execução registrada) E nada está RUNNING/PENDING.
 */
export async function getSheetRefreshStatus(baselineSignature: string): Promise<{
  done: boolean
  running: boolean
  hasSources: boolean
}> {
  const credentials = getCredentials()
  const rawId = process.env.GOOGLE_SHEET_ID
  if (!credentials || !rawId) return { done: true, running: false, hasSources: false }

  const sheetId = extractSheetId(rawId)
  const token = await getAccessToken(credentials)
  const states = await getDataExecutionStates(sheetId, token)
  if (states.length === 0) return { done: true, running: false, hasSources: false }

  const sig = refreshSignature(states)
  const running = states.some((s) => s.state === "RUNNING" || s.state === "PENDING")
  const avancou = sig !== baselineSignature
  return { done: avancou && !running, running, hasSources: true }
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

/** Nome da aba de registro de anomalias da roteirização. */
const ANOMALIAS_SHEET_TAB = "Anomalias"

/**
 * Lê a aba "Anomalias" (problemas registrados durante a roteirização). Mapeia por
 * posição de coluna (cabeçalhos estáveis):
 *   A(0) Registrado em | B(1) Data da Coleta | D(3) HUB | E(4) Tipo de roteirização
 *   F(5) Informe o Problema Encontrado | G(6) Houve atraso na roteirização? (Sim/Não)
 *   I(8) Descrição da Anomalia
 * Retorna [] se a aba não existir / não configurado (não quebra o fluxo principal).
 */
export async function fetchAnomaliasFromSheet(): Promise<Anomalia[]> {
  const credentials = getCredentials()
  const rawId = process.env.GOOGLE_SHEET_ID
  if (!credentials || !rawId) return []

  const sheetId = extractSheetId(rawId)
  const token = await getAccessToken(credentials)
  const range = `'${ANOMALIAS_SHEET_TAB.replace(/'/g, "''")}'!A:I`

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    console.log(`[v0] Aba ${ANOMALIAS_SHEET_TAB} indisponível (${res.status}): ${body.slice(0, 150)}`)
    return []
  }

  const json = (await res.json()) as { values?: string[][] }
  const values = json.values ?? []
  if (values.length < 2) return []

  const rows: Anomalia[] = []
  for (let r = 1; r < values.length; r++) {
    const row = values[r]
    if (!row || row.length === 0) continue
    const hub = (row[3] ?? "").trim() // coluna D
    const registradoEm = normalizeDate(row[0] ?? "") // coluna A (ignora a hora)
    if (!hub && !registradoEm) continue
    const houveAtrasoRaw = (row[6] ?? "").trim().toLowerCase() // coluna G
    rows.push({
      registradoEm,
      dataColeta: normalizeDate(row[1] ?? ""), // coluna B
      hub,
      regional: regionalForHub(hub),
      tipoRoteirizacao: (row[4] ?? "").trim(), // coluna E
      problema: (row[5] ?? "").trim() || "Não informado", // coluna F
      houveAtraso: houveAtrasoRaw.startsWith("sim"), // coluna G
      descricao: (row[8] ?? "").trim(), // coluna I
    })
  }
  return rows
}

/** Nome da aba com o histórico Routing By Meli 1.0 (roteirizações D-2 via formulário). */
const D2_SHEET_TAB = "Routing_Clock_D-2"

/**
 * Lê a aba "Routing_Clock_D-2" (histórico RBM 1.0). Mapeia por posição de coluna:
 *   A (0) = data da roteirização | B (1) = HUB | C (2) = data da coleta
 *   O (14) = "Entrega no Prazo?"  -> "Entrega no prazo" = dentro da meta
 * Retorna [] se a aba não existir ou não estiver configurado (não quebra o fluxo principal).
 */
export async function fetchD2RowsFromSheet(): Promise<D2Row[]> {
  const credentials = getCredentials()
  const rawId = process.env.GOOGLE_SHEET_ID
  if (!credentials || !rawId) return []

  const sheetId = extractSheetId(rawId)
  const token = await getAccessToken(credentials)
  const range = `'${D2_SHEET_TAB.replace(/'/g, "''")}'!A:R`

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    console.log(`[v0] Aba ${D2_SHEET_TAB} indisponível (${res.status}): ${body.slice(0, 150)}`)
    return []
  }

  const json = (await res.json()) as { values?: string[][] }
  const values = json.values ?? []
  if (values.length < 2) return []

  const rows: D2Row[] = []
  // Pula o cabeçalho (linha 0).
  for (let r = 1; r < values.length; r++) {
    const row = values[r]
    if (!row || row.length === 0) continue
    const hub = (row[1] ?? "").trim() // coluna B
    const entregaRaw = (row[14] ?? "").trim() // coluna O
    if (!hub || !entregaRaw) continue
    // "Entrega no prazo" = dentro da meta; "Entrega fora do prazo" = fora da meta.
    const entregaNoPrazo = !entregaRaw.toLowerCase().includes("fora")
    rows.push({
      hub,
      dataRoteirizacao: normalizeDate(row[0] ?? ""), // coluna A (ignora a parte de hora)
      dataColeta: normalizeDate(row[2] ?? ""), // coluna C
      entregaNoPrazo,
    })
  }
  return rows
}
