// Identifica a primeira data de coleta planejada (RTG_ORD_PLAN_LOCAL_DATE)
// por HUB e por modelo (tactical / replanning).
import { fetchRoutingData } from "../lib/google-sheets.ts"

const rows = await fetchRoutingData()
console.log("Total linhas:", rows.length)

// map: hub -> { tactical: minDate, replanning: minDate }
const byHub = new Map()

for (const r of rows) {
  const hub = r.SHP_FACILITY_ID
  const type = r.planification_type
  const plan = r.RTG_ORD_PLAN_LOCAL_DATE
  if (!hub || !plan || (type !== "tactical" && type !== "replanning")) continue

  if (!byHub.has(hub)) byHub.set(hub, { tactical: null, replanning: null })
  const e = byHub.get(hub)
  if (!e[type] || plan < e[type]) e[type] = plan
}

const hubs = [...byHub.keys()].sort()

console.log("\n| HUB | Primeira coleta tactical | Primeira coleta replanning |")
console.log("|-----|--------------------------|----------------------------|")
for (const hub of hubs) {
  const e = byHub.get(hub)
  console.log(`| ${hub} | ${e.tactical ?? "-"} | ${e.replanning ?? "-"} |`)
}
