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
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
  const c = await auth.getClient()
  return (await c.getAccessToken()).token
}
async function readableTitle(id, t) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties(title,sheetType)`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
  const json = await res.json()
  const sheets = json.sheets ?? []
  const grid = sheets.find((s) => s.properties?.sheetType === "GRID" && s.properties?.title)
  return grid?.properties?.title ?? sheets[0]?.properties?.title
}
async function main() {
  const cred = getCredentials()
  const id = extractSheetId(process.env.GOOGLE_SHEET_ID || "")
  const t = await token(cred)
  const rawRange = (process.env.GOOGLE_SHEET_RANGE || "").trim()
  let range
  if (rawRange.includes("!")) range = rawRange.split("!")[0] + "!1:1"
  else {
    const tab = await readableTitle(id, t)
    range = `'${tab.replace(/'/g, "''")}'!1:1`
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
  const json = await res.json()
  console.log("[v0] HEADERS:", JSON.stringify(json.values?.[0]))
}
main().catch((e) => console.log("[v0] erro:", e.message))
