import { fetchRoutingOrders } from "../lib/bigquery.ts"
import { fetchD2RowsFromSheet } from "../lib/google-sheets.ts"
import { processD2Rows, processRows } from "../lib/routing-clock.ts"

const [{ rows }, d2] = await Promise.all([fetchRoutingOrders(), fetchD2RowsFromSheet().catch(() => [])])
const orders = [...processRows(rows), ...processD2Rows(d2)]

const total = orders.length
const dentroMetaAtual = orders.filter((o) => o.isAdherent).length // regra atual = só prazo
const estouroDentroPrazo = orders.filter((o) => o.withinDeadline && o.tmrState === "estouro").length
const seContasseEstouro = orders.filter((o) => o.withinDeadline && o.tmrState !== "estouro").length

const pct = (n) => ((n / total) * 100).toFixed(2)
console.log("Total roteiros:", total)
console.log("Performance ATUAL (só prazo):", pct(dentroMetaAtual) + "%", `(${dentroMetaAtual})`)
console.log("Roteiros DENTRO do prazo MAS com estouro de TMR:", estouroDentroPrazo)
console.log("Performance SE estouro contasse como fora:", pct(seContasseEstouro) + "%", `(${seContasseEstouro})`)
