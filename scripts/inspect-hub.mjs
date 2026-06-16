import { fetchRowsFromSheet } from "../lib/google-sheets.ts"

const rows = await fetchRowsFromSheet()
const hub = process.argv[2] || "BRXSP10"
const sel = rows.filter((r) => r.SHP_FACILITY_ID === hub)

const toMin = (hhmm) => {
  const [h = "0", m = "0"] = (hhmm || "").split(":")
  return Number(h) * 60 + Number(m)
}
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0)
const avgPos = (a) => avg(a.filter((n) => n > 0))

console.log(`HUB ${hub}: ${sel.length} linhas`)
console.log("amostra 5 linhas (time_to_update | TMR_Routing | TMR_Routing_Exec):")
for (const r of sel.slice(0, 5)) {
  console.log(`  ${r.time_to_update} | ${r.TMR_Routing} | ${r.TMR_Routing_Exec}`)
}
console.log("médias (min):")
console.log("  time_to_update :", avgPos(sel.map((r) => toMin(r.time_to_update))))
console.log("  TMR_Routing    :", avgPos(sel.map((r) => toMin(r.TMR_Routing))))
console.log("  TMR_Routing_Exec:", avgPos(sel.map((r) => toMin(r.TMR_Routing_Exec))))
