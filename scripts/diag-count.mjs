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
const examples = {}
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
    if (!examples[motivo]) examples[motivo] = []
    if (examples[motivo].length < 3) {
      examples[motivo].push({
        hub: r.SHP_FACILITY_ID,
        coleta: `${r.RTG_ORD_PLAN_LOCAL_DATE} (${dow[cd.getDay()]})`,
        tipo: r.planification_type,
        publicado: `${r.updated_date} ${r.updated_time}`,
      })
    }
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
console.log("\n5) Exemplos de roteiros descartados:")
for (const [m, list] of Object.entries(examples)) {
  console.log(`   [${m}]`)
  for (const ex of list) console.log(`     HUB ${ex.hub} | coleta ${ex.coleta} | ${ex.tipo} | publicado ${ex.publicado}`)
}

console.log("\n6) Investigação BRXSP6 (datas distintas):")
console.log("   ",
  [...new Set(rows.filter((r) => r.SHP_FACILITY_ID === "BRXSP6").map((r) => `${r.RTG_ORD_PLAN_LOCAL_DATE}(${dow[new Date(r.RTG_ORD_PLAN_LOCAL_DATE + "T00:00:00").getDay()]}/${r.planification_type})`))].sort().join(", "))
console.log("   -> tem coleta SEGUNDA 12/01 replanning?",
  rows.some((r) => r.SHP_FACILITY_ID === "BRXSP6" && r.RTG_ORD_PLAN_LOCAL_DATE === "2026-01-12" && r.planification_type === "replanning"))
