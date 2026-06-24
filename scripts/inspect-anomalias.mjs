import { GoogleAuth } from "google-auth-library"

function extractSheetId(raw) {
  const v = (raw || "").trim()
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : v
}

function getCredentials() {
  const email = process.env.GCP_CLIENT_EMAIL
  const key = process.env.GCP_PRIVATE_KEY
  if (email && key) return { client_email: email.trim(), private_key: key.replace(/\\n/g, "\n") }
  const raw = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (raw) {
    const parsed = JSON.parse(raw)
    return { client_email: parsed.client_email, private_key: String(parsed.private_key).replace(/\\n/g, "\n") }
  }
  return null
}

async function token(credentials) {
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] })
  const client = await auth.getClient()
  const t = await client.getAccessToken()
  return t.token
}

const creds = getCredentials()
const sheetId = extractSheetId(process.env.GOOGLE_SHEET_ID)
const tk = await token(creds)

// 1) Lista todas as abas
const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties(title,sheetType)`
const meta = await (await fetch(metaUrl, { headers: { Authorization: `Bearer ${tk}` } })).json()
console.log("=== ABAS ===")
for (const s of meta.sheets ?? []) console.log(`- "${s.properties?.title}" (${s.properties?.sheetType})`)

// 2) Acha a aba de anomalias
const anomTab = (meta.sheets ?? [])
  .map((s) => s.properties?.title)
  .find((t) => (t || "").toLowerCase().includes("anomal"))

if (!anomTab) {
  console.log("\nNenhuma aba com 'anomal' no nome.")
  process.exit(0)
}

console.log(`\n=== ABA DE ANOMALIAS: "${anomTab}" ===`)
const range = `'${anomTab.replace(/'/g, "''")}'!A:Z`
const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
const vals = (await (await fetch(valUrl, { headers: { Authorization: `Bearer ${tk}` } })).json()).values ?? []
console.log(`Linhas totais (com header): ${vals.length}`)
console.log("\n=== CABEÇALHOS ===")
;(vals[0] ?? []).forEach((h, i) => console.log(`  [${i}] ${String.fromCharCode(65 + i)} = "${h}"`))
console.log("\n=== AMOSTRA (até 5 linhas) ===")
for (let r = 1; r < Math.min(vals.length, 6); r++) {
  console.log(`Linha ${r}:`, JSON.stringify(vals[r]))
}
