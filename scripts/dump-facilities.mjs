import { fetchRoutingOrders } from "../lib/bigquery.ts"
import { regionalForHub } from "../lib/hubs.ts"

const { rows, fonte } = await fetchRoutingOrders()
console.log("FONTE:", fonte, "| linhas:", rows.length)

const byFacility = {}
for (const r of rows) {
  const f = r.SHP_FACILITY_ID || "(vazio)"
  byFacility[f] = (byFacility[f] || 0) + 1
}

const sorted = Object.entries(byFacility).sort((a, b) => b[1] - a[1])
console.log("\nFacility | Regional derivada | Qtd")
let nd = 0
for (const [f, qt] of sorted) {
  const reg = regionalForHub(f)
  if (reg === "N/D") nd += qt
  console.log(`  ${f.padEnd(12)} ${reg.padEnd(8)} ${qt}`)
}
console.log("\nTotal facilities distintos:", sorted.length)
console.log("Linhas sem regional (N/D):", nd)
