import { google } from "googleapis"

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) {
    console.log("[v0] GOOGLE_SHEET_ID não configurado")
    return
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GCP_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties(title,sheetType)" })
  const grid = meta.data.sheets?.find((s) => s.properties?.sheetType === "GRID")
  const title = grid?.properties?.title
  console.log("[v0] aba legível:", title)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${title}!1:1` })
  console.log("[v0] HEADERS:", JSON.stringify(res.data.values?.[0]))
}
main().catch((e) => console.log("[v0] erro:", e.message))
