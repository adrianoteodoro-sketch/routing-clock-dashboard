import { fetchRowsFromSheet } from "../lib/google-sheets.ts"

const rows = await fetchRowsFromSheet()
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

// BRXSP10: TMR_Routing_Exec varia por linha? Como se relaciona com time_to_update e TMR_Routing?
const brx = rows.filter((r) => r.SHP_FACILITY_ID === "BRXSP10")
console.log("BRXSP10 linhas:", brx.length)
console.log("BRXSP10 TMR_Routing distintos:", [...new Set(brx.map((r) => r.TMR_Routing))])
console.log("BRXSP10 TMR_Routing_Exec distintos:", [...new Set(brx.map((r) => r.TMR_Routing_Exec))].slice(0, 12))
console.log(
  "BRXSP10 amostra (ttu / TMR_Routing / TMR_Routing_Exec):",
  brx.slice(0, 8).map((r) => `${r.time_to_update} / ${r.TMR_Routing} / ${r.TMR_Routing_Exec}`),
)
