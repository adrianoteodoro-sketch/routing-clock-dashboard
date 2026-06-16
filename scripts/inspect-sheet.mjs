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

const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(title,sheetType,gridProperties)`
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
console.log("status:", res.status)
console.log(await res.text())
