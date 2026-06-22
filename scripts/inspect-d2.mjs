// Inspeciona a aba Routing_Clock_D-2 da planilha (cabeçalho + amostra).
import { GoogleAuth } from "google-auth-library"

function extractSheetId(raw) {
  const v = (raw || "").trim()
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : v
}

const email = process.env.GCP_CLIENT_EMAIL
const key = (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n")
const sheetId = extractSheetId(process.env.GOOGLE_SHEET_ID || "")

const auth = new GoogleAuth({
  credentials: { client_email: email, private_key: key },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
})
const client = await auth.getClient()
const token = (await client.getAccessToken()).token

// Lista as abas disponíveis
const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties(title,sheetType,gridProperties)`
const meta = await (await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } })).json()
console.log("=== ABAS ===")
for (const s of meta.sheets ?? []) {
  const p = s.properties
  console.log(`  "${p.title}" | tipo ${p.sheetType} | linhas ${p.gridProperties?.rowCount ?? "?"} x cols ${p.gridProperties?.columnCount ?? "?"}`)
}

// Lê a aba D-2
const range = "'Routing_Clock_D-2'!A:Z"
const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) {
  console.log("ERRO ao ler aba:", res.status, (await res.text()).slice(0, 200))
  process.exit(1)
}
const json = await res.json()
const values = json.values ?? []
console.log(`\n=== Routing_Clock_D-2: ${values.length} linhas ===`)
const cols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
console.log("\n--- CABEÇALHO (com letra da coluna) ---")
;(values[0] ?? []).forEach((h, i) => console.log(`  ${cols[i]} (${i}): "${h}"`))
console.log("\n--- AMOSTRA (3 primeiras linhas de dados) ---")
for (let r = 1; r <= 3 && r < values.length; r++) {
  console.log(`  linha ${r}:`, JSON.stringify(values[r]))
}
// Distribuição da coluna O (índice 14)
const oIdx = 14
const dist = {}
for (let r = 1; r < values.length; r++) {
  const v = (values[r]?.[oIdx] ?? "").trim()
  dist[v] = (dist[v] ?? 0) + 1
}
console.log("\n--- Distribuição coluna O (índice 14) ---")
console.log(JSON.stringify(dist, null, 2))
