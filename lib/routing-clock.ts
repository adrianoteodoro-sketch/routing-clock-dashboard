import type {
  DashboardData,
  Filters,
  Ofensor,
  RangeSeveridade,
  RawRoutingOrder,
  RoutingOrder,
  SeriePonto,
  WaterfallPonto,
} from "./types"
import { regionalForHub } from "./hubs"

export const META_PERFORMANCE = 95 // % das operações entregues dentro do horário

// ----------------------------------------------------------------------------
// Helpers de tempo
// ----------------------------------------------------------------------------

/** Converte "HH:MM" ou "HH:MM:SS" em minutos. */
export function hhmmToMinutes(value: string): number {
  if (!value) return 0
  const parts = value.split(":").map((p) => Number.parseInt(p, 10))
  const [h = 0, m = 0] = parts
  return h * 60 + m
}

/** Converte minutos em "HH:MM". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function parseDateTime(date: string, time: string): Date {
  // date "YYYY-MM-DD", time "HH:MM:SS" -> Date local
  // Normaliza horários potencialmente inválidos (ex.: "01:60") usando aritmética de minutos.
  const safeTime = (time || "00:00:00").trim()
  const [hStr = "0", mStr = "0", sStr = "0"] = safeTime.split(":")
  const totalMinutes = (Number.parseInt(hStr, 10) || 0) * 60 + (Number.parseInt(mStr, 10) || 0)
  const seconds = Number.parseInt(sStr, 10) || 0
  const base = new Date(`${date}T00:00:00`)
  if (Number.isNaN(base.getTime())) {
    return new Date(0)
  }
  base.setMinutes(base.getMinutes() + totalMinutes)
  base.setSeconds(seconds)
  return base
}

/** Número da semana ISO (Wxx). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ----------------------------------------------------------------------------
// Regras de prazo (dia/hora limite de entrega)
// ----------------------------------------------------------------------------

/** Retorna a segunda-feira (00:00) da semana da data informada. */
function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7 // 1=segunda ... 7=domingo
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function atHour(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Calcula o prazo (data/hora limite) de publicação do roteiro a partir
 * da data de coleta e do tipo de planificação.
 *
 * W-1 (tactical):
 *  - Coleta seg/ter (próxima semana) -> quarta da semana vigente 18:00
 *  - Coleta qua/qui/sex -> quinta da semana vigente 18:00
 *  - Coleta sábado (excepcional) -> quarta da mesma semana 13:00
 * D-1 (replanning): entrega no dia útil anterior à coleta às 17:00
 *  - ter->seg, qua->ter, qui->qua, sex->qui, seg->sex anterior
 */
export function getDeadline(collectionDate: Date, type: "tactical" | "replanning"): Date | null {
  const dow = collectionDate.getDay() // 0=dom 1=seg ... 6=sab
  const monday = mondayOf(collectionDate)

  if (type === "tactical") {
    // Semana vigente = semana anterior à coleta
    const prevMonday = addDays(monday, -7)
    if (dow === 1 || dow === 2) {
      // quarta da semana vigente 18:00
      return atHour(addDays(prevMonday, 2), 18)
    }
    if (dow === 3 || dow === 4 || dow === 5) {
      // quinta da semana vigente 18:00
      return atHour(addDays(prevMonday, 3), 18)
    }
    if (dow === 6) {
      // sábado excepcional -> quarta da própria semana 13:00
      return atHour(addDays(monday, 2), 13)
    }
    return null
  }

  // replanning (D-1) - dia útil anterior 17:00
  switch (dow) {
    case 2: // terça -> segunda
      return atHour(addDays(collectionDate, -1), 17)
    case 3: // quarta -> terça
      return atHour(addDays(collectionDate, -1), 17)
    case 4: // quinta -> quarta
      return atHour(addDays(collectionDate, -1), 17)
    case 5: // sexta -> quinta
      return atHour(addDays(collectionDate, -1), 17)
    case 1: // segunda -> sexta anterior
      return atHour(addDays(collectionDate, -3), 17)
    default:
      return null
  }
}

// ----------------------------------------------------------------------------
// Processamento das linhas cruas -> RoutingOrder classificada
// ----------------------------------------------------------------------------

export function processRows(rows: RawRoutingOrder[]): RoutingOrder[] {
  const result: RoutingOrder[] = []

  for (const r of rows) {
    // Regional do roteiro: usa a coluna da planilha/query ou deriva do HUB.
    const regional = r.Regional || regionalForHub(r.SHP_FACILITY_ID)

    // Facilities sem regional mapeada (ex.: BRXSP6) ficam fora do dashboard.
    if (regional === "N/D") continue

    const durationMinutes = hhmmToMinutes(r.time_to_update)
    const tmrMinutes = hhmmToMinutes(r.TMR_Routing)
    const tmrTargetMinutes = hhmmToMinutes(r.TMR_Routing_30pct)

    // Classificação de TMR
    let tmrState: RoutingOrder["tmrState"]
    if (durationMinutes <= tmrMinutes) tmrState = "ok"
    else if (durationMinutes <= tmrTargetMinutes) tmrState = "risco"
    else tmrState = "estouro"

    // Aderência de prazo (dia/hora limite)
    const collectionDate = new Date(`${r.RTG_ORD_PLAN_LOCAL_DATE}T00:00:00`)
    const publishedAt = parseDateTime(r.updated_date, r.updated_time)
    const deadline = getDeadline(collectionDate, r.planification_type)

    // Ordens sem regra de prazo (ex.: coleta no domingo) ficam fora do Routing Clock:
    // não contam no volume nem na performance, evitando inflar o indicador.
    if (!deadline) continue

    const withinDeadline = publishedAt.getTime() <= deadline.getTime()

    // Aderente ao Routing Clock = publicado dentro do prazo
    const isAdherent = withinDeadline

    // Motivo da não aderência
    let reason = "Aderente"
    if (!isAdherent) {
      reason = tmrState === "estouro" ? "Estouro de TMR" : "Fora do prazo de entrega"
    } else if (tmrState === "estouro") {
      reason = "Estouro de TMR"
    } else if (tmrState === "risco") {
      reason = "Risco de estouro de TMR"
    }

    const created = new Date(`${r.created_date}T00:00:00`)

    result.push({
      facilityId: r.SHP_FACILITY_ID,
      planificationType: r.planification_type,
      collectionDate: r.RTG_ORD_PLAN_LOCAL_DATE,
      routingDate: r.created_date,
      publishedAt: publishedAt.toISOString(),
      durationMinutes,
      tmrMinutes,
      tmrTargetMinutes,
      tmrState,
      withinDeadline,
      isAdherent,
      regional,
      month: `${created.getFullYear()}/${created.getMonth() + 1}`,
      week: `W${isoWeek(created)}`,
      reason,
    })
  }

  return result
}

// ----------------------------------------------------------------------------
// Filtros e agregações -> DashboardData
// ----------------------------------------------------------------------------

function applyFilters(orders: RoutingOrder[], f: Filters): RoutingOrder[] {
  return orders.filter((o) => {
    if (f.regional !== "TODAS" && o.regional !== f.regional) return false
    if (f.mes !== "TODOS" && o.month !== f.mes) return false
    if (f.semana !== "TODAS" && o.week !== f.semana) return false
    // Intervalo por data de roteirização (created_date)
    if (f.rotInicio && o.routingDate < f.rotInicio) return false
    if (f.rotFim && o.routingDate > f.rotFim) return false
    // Intervalo por data de coleta (RTG_ORD_PLAN_LOCAL_DATE)
    if (f.coletaInicio && o.collectionDate < f.coletaInicio) return false
    if (f.coletaFim && o.collectionDate > f.coletaFim) return false
    return true
  })
}

function perf(orders: RoutingOrder[]): number {
  if (orders.length === 0) return 0
  const ok = orders.filter((o) => o.isAdherent).length
  return (ok / orders.length) * 100
}

function buildSerie(orders: RoutingOrder[], key: "month" | "week"): SeriePonto[] {
  const groups = new Map<string, RoutingOrder[]>()
  for (const o of orders) {
    const k = o[key]
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(o)
  }
  const sortKey = (label: string) =>
    key === "week" ? Number.parseInt(label.replace("W", ""), 10) : Number.parseInt(label.split("/")[1], 10)
  return [...groups.entries()]
    .sort((a, b) => sortKey(a[0]) - sortKey(b[0]))
    .map(([label, items]) => ({
      label,
      performance: Number(perf(items).toFixed(2)),
      volume: items.length,
      meta: META_PERFORMANCE,
    }))
}

function buildWaterfall(orders: RoutingOrder[]): WaterfallPonto[] {
  const total = orders.length
  const performance = perf(orders)
  if (total === 0) {
    return [
      { label: "Performance", valor: 0, acumulado: 0, tipo: "inicio" },
      { label: "Total", valor: 0, acumulado: 0, tipo: "total" },
    ]
  }

  // Agrupa as não aderências por motivo
  const breaches = orders.filter((o) => !o.isAdherent)
  const byReason = new Map<string, number>()
  for (const b of breaches) {
    byReason.set(b.reason, (byReason.get(b.reason) ?? 0) + 1)
  }

  const points: WaterfallPonto[] = []
  const performance2 = Number(performance.toFixed(2))
  points.push({ label: "Performance RC", valor: performance2, acumulado: performance2, tipo: "inicio" })

  let acumulado = performance
  const sortedReasons = [...byReason.entries()].sort((a, b) => b[1] - a[1])
  for (const [reason, count] of sortedReasons) {
    const pp = (count / total) * 100
    acumulado += pp
    points.push({
      label: reason,
      valor: Number(pp.toFixed(2)),
      acumulado: Number(acumulado.toFixed(2)),
      tipo: "perda",
    })
  }

  points.push({ label: "Total", valor: 100, acumulado: 100, tipo: "total" })
  return points
}

function buildOfensores(orders: RoutingOrder[]): Ofensor[] {
  const total = orders.length || 1
  const breaches = orders.filter((o) => !o.isAdherent)
  const groups = new Map<string, { count: number; reasons: Map<string, number> }>()
  for (const b of breaches) {
    if (!groups.has(b.facilityId)) groups.set(b.facilityId, { count: 0, reasons: new Map() })
    const g = groups.get(b.facilityId)!
    g.count += 1
    g.reasons.set(b.reason, (g.reasons.get(b.reason) ?? 0) + 1)
  }
  return [...groups.entries()]
    .map(([facilityId, g]) => {
      const topReason = [...g.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Fora do prazo"
      return {
        facilityId,
        reason: topReason,
        ocorrencias: g.count,
        pctImpacto: Number(((g.count / total) * 100).toFixed(2)),
      }
    })
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 12)
}

function buildRangeSeveridade(orders: RoutingOrder[]): RangeSeveridade[] {
  // Severidade pelo quanto a duração excede o TMR Alvo
  const faixas = [
    { faixa: "Até +15min além do TMR Alvo", min: 0, max: 15, severidade: "baixa" as const },
    { faixa: "+15 a +30min", min: 15, max: 30, severidade: "media" as const },
    { faixa: "+30 a +60min", min: 30, max: 60, severidade: "alta" as const },
    { faixa: "Acima de +60min", min: 60, max: Number.POSITIVE_INFINITY, severidade: "alta" as const },
  ]
  return faixas
    .map((f) => {
      const ocorrencias = orders.filter((o) => {
        const excesso = o.durationMinutes - o.tmrTargetMinutes
        return excesso > f.min && excesso <= f.max
      }).length
      return { faixa: f.faixa, ocorrencias, severidade: f.severidade }
    })
    .filter((f) => f.ocorrencias > 0)
}

export function buildDashboard(
  orders: RoutingOrder[],
  filters: Filters,
  fonte: "bigquery" | "sheets" | "mock",
): DashboardData {
  const filtered = applyFilters(orders, filters)

  const mensal = buildSerie(filtered, "month")
  const semanal = buildSerie(filtered, "week")

  const performanceAtual = perf(filtered)
  const volumeTotal = filtered.length

  // Tendência semana a semana: última semana vs penúltima (períodos comparáveis).
  const ultima = semanal[semanal.length - 1]
  const penultima = semanal[semanal.length - 2]
  const perfUltimaSemana = ultima ? ultima.performance : Number(performanceAtual.toFixed(2))
  const perfSemanaAnterior = penultima ? penultima.performance : perfUltimaSemana
  const volumeUltimaSemana = ultima ? ultima.volume : 0
  const volumeSemanaAnterior = penultima ? penultima.volume : volumeUltimaSemana

  const kpis = {
    performanceAtual: Number(performanceAtual.toFixed(2)),
    volumeTotal,
    meta: META_PERFORMANCE,
    gapPp: Number((performanceAtual - META_PERFORMANCE).toFixed(2)),
    metaAtingida: performanceAtual >= META_PERFORMANCE,
    perfUltimaSemana,
    perfSemanaAnterior,
    volumeUltimaSemana,
    volumeSemanaAnterior,
  }

  const uniq = (arr: string[]) => [...new Set(arr)].filter(Boolean).sort()

  return {
    kpis,
    mensal,
    semanal,
    waterfall: buildWaterfall(filtered),
    ofensores: buildOfensores(filtered),
    rangeSeveridade: buildRangeSeveridade(filtered),
    opcoes: {
      regionais: uniq(orders.map((o) => o.regional)),
      meses: uniq(orders.map((o) => o.month)).sort(
        (a, b) => Number.parseInt(a.split("/")[1]) - Number.parseInt(b.split("/")[1]),
      ),
      semanas: uniq(orders.map((o) => o.week)).sort(
        (a, b) => Number.parseInt(a.replace("W", "")) - Number.parseInt(b.replace("W", "")),
      ),
    },
    fonte,
  }
}
