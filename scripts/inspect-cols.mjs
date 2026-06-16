import { fetchRowsFromSheet } from "../lib/google-sheets.ts"

const hub = process.argv[2] || "BRXSP10"
const rows = await fetchRowsFromSheet()
const hubRows = rows.filter((r) => r.SHP_FACILITY_ID === hub)

console.log(`Total linhas: ${rows.length} | linhas do ${hub}: ${hubRows.length}`)

// valores distintos das colunas de TMR para esta facility
const dist = (key) => [...new Set(hubRows.map((r) => r[key]))].slice(0, 8)
console.log(`time_to_update distintos (amostra):`, dist("time_to_update"))
console.log(`TMR_Routing distintos:`, dist("TMR_Routing"))
console.log(`TMR_Routing_Exec distintos:`, dist("TMR_Routing_Exec"))

console.log("\nAmostra de 8 roteiros (time_to_update | TMR_Routing | TMR_Routing_Exec):")
for (const r of hubRows.slice(0, 8)) {
  console.log(
    `  ${r.RTG_ORD_PLAN_LOCAL_DATE}  ttu=${r.time_to_update}  TMR=${r.TMR_Routing}  Exec=${r.TMR_Routing_Exec}`,
  )
}

// comparar média de time_to_update com as colunas
const toMin = (v) => {
  const [h = "0", m = "0"] = String(v).split(":")
  return Number(h) * 60 + Number(m)
}
const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
console.log("\nMédia time_to_update:", avg(hubRows.map((r) => toMin(r.time_to_update))), "min")
console.log("TMR_Routing (1º):", toMin(hubRows[0].TMR_Routing), "min")
console.log("TMR_Routing_Exec (1º):", toMin(hubRows[0].TMR_Routing_Exec), "min")
