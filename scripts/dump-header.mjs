import { GoogleAuth } from "google-auth-library"

const email = process.env.GCP_CLIENT_EMAIL
const key = process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n")
const rawId = process.env.GOOGLE_SHEET_ID.trim()
const m = rawId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
const sheetId = m ? m[1] : rawId

const auth = new GoogleAuth({
  credentials: { client_email: email, private_key: key },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
})
const client = await auth.getClient()
const token = (await client.getAccessToken()).token

const range = "Extração_Query!A1:Z4"
const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
const json = await res.json()
const rows = json.values || []
console.log("CABEÇALHO:")
;(rows[0] || []).forEach((c, i) => console.log(`  [${i}] "${c}"`))
console.log("\nLINHA 1:", JSON.stringify(rows[1]))
console.log("LINHA 2:", JSON.stringify(rows[2]))
