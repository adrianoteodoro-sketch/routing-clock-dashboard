import { fetchRowsFromSheet } from "../lib/google-sheets.ts"
import { processRows, getDeadline } from "../lib/routing-clock.ts"

const rows = await fetchRowsFromSheet()
console.log("1) Linhas parseadas (com facility):", rows.length)

// Reconstroi o índice de coletas de segunda (replanning) por HUB
const mondays = new Set()
for (const r of rows) {
  if (r.planification_type !== "replanning") continue
  const cd = new Date(`${r.RTG_ORD_PLAN_LOCAL_DATE}T00:00:00`)
  if (cd.getDay() === 1) mondays.add(`${r.SHP_FACILITY_ID}|${r.RTG_ORD_PLAN_LOCAL_DATE}`)
}

const dow = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const dropped = {}
let kept = 0
let semData = 0

for (const r of rows) {
  if (!r.RTG_ORD_PLAN_LOCAL_DATE) {
    semData++
    continue
  }
  const cd = new Date(`${r.RTG_ORD_PLAN_LOCAL_DATE}T00:00:00`)
  let deadline = getDeadline(cd, r.planification_type, r.SHP_FACILITY_ID)
  let motivo = null
  if (!deadline) {
    motivo = `sem regra (${dow[cd.getDay()]}/${r.planification_type})`
  } else if (r.planification_type === "replanning" && cd.getDay() === 2) {
    const pm = new Date(cd)
    pm.setDate(pm.getDate() - 1)
    const key = `${r.SHP_FACILITY_ID}|${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, "0")}-${String(pm.getDate()).padStart(2, "0")}`
    if (!mondays.has(key)) motivo = "terça sem segunda (D-1)"
  }
  if (motivo) {
    dropped[motivo] = (dropped[motivo] ?? 0) + 1
  } else {
    kept++
  }
}

console.log("2) Linhas sem RTG_ORD_PLAN_LOCAL_DATE:", semData)
console.log("3) Roteiros mantidos no dash:", kept)
console.log("4) Descartados por motivo:")
for (const [m, n] of Object.entries(dropped).sort((a, b) => b[1] - a[1])) {
  console.log(`   - ${m}: ${n}`)
}
const totalDropped = Object.values(dropped).reduce((a, b) => a + b, 0) + semData
console.log("Total descartado:", totalDropped, "| Soma:", kept + totalDropped, "vs parseadas:", rows.length)
