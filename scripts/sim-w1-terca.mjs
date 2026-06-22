import { fetchRoutingOrders } from "../lib/bigquery.ts"
import { fetchD2RowsFromSheet } from "../lib/google-sheets.ts"
import { processRows, processD2Rows } from "../lib/routing-clock.ts"

const { rows, fonte } = await fetchRoutingOrders()
const d2 = await fetchD2RowsFromSheet().catch(() => [])
const orders = [...processRows(rows), ...processD2Rows(d2)]

const pct = (n, d) => (d === 0 ? 0 : (n / d) * 100)
const fmt = (n) => n.toFixed(2) + "%"

// Baseline
const total = orders.length
const baseAderentes = orders.filter((o) => o.withinDeadline).length

// Cenário: W-1 com coleta na TERÇA ganham +24h no prazo (quarta 18:00 -> quinta 18:00)
let mudaram = 0
let w1tercaTotal = 0
let w1tercaAderBase = 0
let w1tercaAderNovo = 0

const cenarioAderentes = orders.filter((o) => {
  const isW1Terca =
    o.tipoRoteirizacao === "W-1" &&
    new Date(`${o.collectionDate}T00:00:00`).getDay() === 2

  if (!isW1Terca) return o.withinDeadline

  w1tercaTotal++
  if (o.withinDeadline) w1tercaAderBase++

  // novo prazo = prazo atual + 24h
  const novoPrazo = new Date(o.deadline).getTime() + 24 * 60 * 60 * 1000
  const publicado = new Date(o.publishedAt).getTime()
  const aderenteNovo = publicado <= novoPrazo
  if (aderenteNovo) w1tercaAderNovo++
  if (aderenteNovo && !o.withinDeadline) mudaram++
  return aderenteNovo
}).length

console.log("Fonte:", fonte, "| Total roteiros:", total)
console.log("")
console.log("=== PERFORMANCE GERAL ===")
console.log("Atual   :", fmt(pct(baseAderentes, total)), `(${baseAderentes}/${total})`)
console.log("Cenário :", fmt(pct(cenarioAderentes, total)), `(${cenarioAderentes}/${total})`)
console.log("Ganho   :", fmt(pct(cenarioAderentes, total) - pct(baseAderentes, total)), `| +${mudaram} roteiros viram aderentes`)
console.log("")
console.log("=== RECORTE W-1 COLETA NA TERÇA ===")
console.log("Roteiros W-1 terça:", w1tercaTotal)
console.log("Aderência atual   :", fmt(pct(w1tercaAderBase, w1tercaTotal)), `(${w1tercaAderBase}/${w1tercaTotal})`)
console.log("Aderência cenário :", fmt(pct(w1tercaAderNovo, w1tercaTotal)), `(${w1tercaAderNovo}/${w1tercaTotal})`)
