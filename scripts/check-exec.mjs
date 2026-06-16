import { fetchFromSheets } from "../lib/google-sheets.ts"

const rows = await fetchFromSheets()
console.log("Total linhas:", rows.length)

// Conta por facility quantas têm TMR_Routing_Exec vazio vs preenchido
const vazioExec = rows.filter((r) => !r.TMR_Routing_Exec || r.TMR_Routing_Exec.trim() === "")
const vazioRouting = rows.filter((r) => !r.TMR_Routing || r.TMR_Routing.trim() === "")
console.log("Linhas com TMR_Routing_Exec VAZIO:", vazioExec.length)
console.log("Linhas com TMR_Routing VAZIO:", vazioRouting.length)

// Facilities com Exec vazio
const facsVazio = [...new Set(vazioExec.map((r) => r.SHP_FACILITY_ID))]
console.log("Facilities com Exec vazio:", facsVazio.slice(0, 20))

// Distribuição de valores Exec
const distinct = [...new Set(rows.map((r) => r.TMR_Routing_Exec))]
console.log("Valores distintos de TMR_Routing_Exec (amostra):", distinct.slice(0, 15))

// Amostra de uma facility com Exec vazio
if (facsVazio.length > 0) {
  const f = facsVazio[0]
  const sample = rows.filter((r) => r.SHP_FACILITY_ID === f).slice(0, 3)
  console.log(`Amostra da facility ${f}:`, sample.map((r) => ({ ttu: r.time_to_update, tmr: r.TMR_Routing, exec: r.TMR_Routing_Exec })))
}
