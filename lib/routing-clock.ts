import type {
  DashboardData,
  Filters,
  HubAnalise,
  HubAnaliseSecao,
  HubDiaResumo,
  HubResumo,
  Ofensor,
  RangeSeveridade,
  RawRoutingOrder,
  RegionalResumo,
  RoutingOrder,
  SeriePonto,
  TipoRoteirizacao,
  WaterfallPonto,
} from "./types"
import { regionalForHub } from "./hubs"
import { DEADLINE_EXCEPTIONS } from "./routing-clock-exceptions"

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

/** Adiciona N dias úteis (pula sábado e domingo). */
function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date)
  let remaining = days
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) remaining--
  }
  return d
}

/** Retorna a primeira exceção de DEADLINE_EXCEPTIONS que casa com a coleta, ou null. */
function matchException(facilityId: string, collectionDate: Date, type: "tactical" | "replanning") {
  const ymd = `${collectionDate.getFullYear()}-${String(collectionDate.getMonth() + 1).padStart(2, "0")}-${String(
    collectionDate.getDate(),
  ).padStart(2, "0")}`

  for (const exc of DEADLINE_EXCEPTIONS) {
    if (exc.hubs !== "*" && !exc.hubs.includes(facilityId)) continue
    if (exc.tipos && !exc.tipos.includes(type)) continue
    if (exc.deData && ymd < exc.deData) continue
    if (exc.ateData && ymd > exc.ateData) continue
    return exc
  }
  return null
}

/**
 * Retorna o prazo alternativo se a coleta casar com alguma exceção configurada
 * em DEADLINE_EXCEPTIONS. Caso contrário, retorna null (usa-se a regra padrão).
 */
function getExceptionDeadline(
  facilityId: string,
  collectionDate: Date,
  type: "tactical" | "replanning",
): Date | null {
  const exc = matchException(facilityId, collectionDate, type)
  if (!exc) return null
  // Coleta no fim de semana não tem prazo nesta regra (consistente com o padrão).
  const dow = collectionDate.getDay()
  if (dow === 0 || dow === 6) return null
  return atHour(addBusinessDays(collectionDate, exc.regraDiasUteis), exc.hora, exc.minuto ?? 0)
}

/**
 * Classifica o tipo de roteirização para exibição/filtro:
 *  - HUB de exceção (longa distância) -> "D-2"
 *  - tactical -> "W-1"
 *  - replanning padrão -> "D-1"
 */
function getTipoRoteirizacao(
  facilityId: string,
  collectionDate: Date,
  type: "tactical" | "replanning",
): TipoRoteirizacao {
  if (matchException(facilityId, collectionDate, type)) return "D-2"
  return type === "tactical" ? "W-1" : "D-1"
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
 *  - sábado -> quarta anterior às 14:00 (regra específica do sábado)
 */
export function getDeadline(
  collectionDate: Date,
  type: "tactical" | "replanning",
  facilityId?: string,
): Date | null {
  // Exceções configuradas (lista fixa) têm prioridade sobre a regra padrão.
  if (facilityId) {
    const exception = getExceptionDeadline(facilityId, collectionDate, type)
    if (exception) return exception
  }

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
    case 6: // sábado -> quarta anterior 14:00
      return atHour(addDays(collectionDate, -3), 14)
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
    // TMR executado (coluna TMR_Routing_Exec) = medida de aderência ao routing clock.
    const tmrTargetMinutes = hhmmToMinutes(r.TMR_Routing_Exec)

    // Classificação de TMR
    let tmrState: RoutingOrder["tmrState"]
    if (durationMinutes <= tmrMinutes) tmrState = "ok"
    else if (durationMinutes <= tmrTargetMinutes) tmrState = "risco"
    else tmrState = "estouro"

    // Aderência de prazo (dia/hora limite)
    const collectionDate = new Date(`${r.RTG_ORD_PLAN_LOCAL_DATE}T00:00:00`)
    const publishedAt = parseDateTime(r.updated_date, r.updated_time)
    const deadline = getDeadline(collectionDate, r.planification_type, r.SHP_FACILITY_ID)

    // Toda operação presente nos dados iniciou a roteirização, portanto conta no volume.
    // Os roteiros D-1 são condicionados à necessidade de cada operação (podem existir ou não);
    // como já estão nos dados, são considerados. Só ficam fora os casos sem regra de prazo
    // (ex.: coleta no domingo), que não têm como ser avaliados quanto ao prazo.
    if (!deadline) continue

    const withinDeadline = publishedAt.getTime() <= deadline.getTime()
    const minutesLate = withinDeadline
      ? 0
      : Math.round((publishedAt.getTime() - deadline.getTime()) / 60000)
    const tmrExcessMinutes = tmrState === "estouro" ? Math.max(0, durationMinutes - tmrTargetMinutes) : 0

    // Aderente ao Routing Clock = publicado dentro do prazo de entrega.
    // O TMR (TMR_Routing_Exec) é apenas sinal de risco/ofensor, não afeta a aderência.
    const isAdherent = withinDeadline

    // Motivo da não aderência (prazo é o que define a aderência; TMR é informativo)
    let reason = "Aderente"
    if (!withinDeadline) {
      reason = tmrState === "estouro" ? "Fora do prazo (com estouro de TMR)" : "Fora do prazo de entrega"
    } else if (tmrState === "estouro") {
      reason = "Estouro de TMR"
    } else if (tmrState === "risco") {
      reason = "Risco de estouro de TMR"
    }

    const created = new Date(`${r.created_date}T00:00:00`)

    result.push({
      facilityId: r.SHP_FACILITY_ID,
      planificationType: r.planification_type,
      tipoRoteirizacao: getTipoRoteirizacao(r.SHP_FACILITY_ID, collectionDate, r.planification_type),
      collectionDate: r.RTG_ORD_PLAN_LOCAL_DATE,
      routingDate: r.created_date,
      routingStartedAt: parseDateTime(r.created_date, r.created_time).toISOString(),
      publishedAt: publishedAt.toISOString(),
      deadline: deadline.toISOString(),
      minutesLate,
      durationMinutes,
      tmrMinutes,
      tmrTargetMinutes,
      tmrExcessMinutes,
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
  if (f.hub && f.hub !== "TODOS" && o.facilityId !== f.hub) return false
  if (f.mes !== "TODOS" && o.month !== f.mes) return false
    if (f.semana !== "TODAS" && o.week !== f.semana) return false
    if (f.tipo && f.tipo !== "TODOS" && o.tipoRoteirizacao !== f.tipo) return false
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
  // Agrupa por mês/semana guardando a MENOR data de roteirização do grupo,
  // para ordenar cronologicamente mesmo quando os dados cruzam a virada de ano
  // (ex.: roteirização W-1 em dez/2025 -> semana "W52" que pertence ao início,
  // não ao fim, da série de 2026).
  const groups = new Map<string, { items: RoutingOrder[]; minDate: string }>()
  for (const o of orders) {
    const k = o[key]
    if (!groups.has(k)) groups.set(k, { items: [], minDate: o.routingDate })
    const g = groups.get(k)!
    g.items.push(o)
    if (o.routingDate < g.minDate) g.minDate = o.routingDate
  }
  return [...groups.entries()]
    .sort((a, b) => (a[1].minDate < b[1].minDate ? -1 : a[1].minDate > b[1].minDate ? 1 : 0))
    .map(([label, g]) => ({
      label,
      performance: Number(perf(g.items).toFixed(2)),
      volume: g.items.length,
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

// ----------------------------------------------------------------------------
// Análise por HUB (atraso e estouro de TMR)
// ----------------------------------------------------------------------------

type HubMetric = "atraso" | "estouro"

/** Agrega os roteiros de um HUB por dia de coleta (atraso + TMR juntos). */
function buildAberturaDiaria(all: RoutingOrder[]): HubDiaResumo[] {
  const map = new Map<string, RoutingOrder[]>()
  for (const o of all) {
    if (!map.has(o.collectionDate)) map.set(o.collectionDate, [])
    map.get(o.collectionDate)!.push(o)
  }

  const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0)
  const avgPos = (nums: number[]) => avg(nums.filter((n) => n > 0))
  const max = (nums: number[]) => nums.reduce((a, b) => Math.max(a, b), 0)

  return [...map.entries()]
    .map(([dia, list]) => {
      const atrasados = list.filter((o) => !o.withinDeadline)
      const estourados = list.filter((o) => o.tmrState === "estouro")
      // Janela de roteirização do dia: início mais cedo e fim mais tarde.
      const inicioISO = list
        .map((o) => o.routingStartedAt)
        .filter(Boolean)
        .sort()[0] ?? ""
      const fimISO = list
        .map((o) => o.publishedAt)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? ""
      return {
        dia,
        inicioISO,
        fimISO,
        total: list.length,
        atrasos: atrasados.length,
        atrasoMedioMin: avg(atrasados.map((o) => o.minutesLate)),
        atrasoPiorMin: max(list.map((o) => o.minutesLate)),
        tmrMedioMin: avg(list.map((o) => o.durationMinutes)),
        // TMR de aderência ao routing clock (coluna TMR_Routing_Exec). Média só dos roteiros com valor definido (>0).
        tmrAlvoMin: avgPos(list.map((o) => o.tmrTargetMinutes)),
        estouros: estourados.length,
        excessoPiorMin: max(list.map((o) => o.tmrExcessMinutes)),
      }
    })
    .sort((a, b) => a.dia.localeCompare(b.dia))
}

function buildHubSecao(orders: RoutingOrder[], metric: HubMetric): HubAnaliseSecao {
  // Predicado e magnitude (minutos) de cada métrica.
  const matches = (o: RoutingOrder) => (metric === "atraso" ? !o.withinDeadline : o.tmrState === "estouro")
  const magnitude = (o: RoutingOrder) => (metric === "atraso" ? o.minutesLate : o.tmrExcessMinutes)

  // Agrupamento por HUB - guardamos TODOS os roteiros (all) para a abertura diária
  const hubMap = new Map<string, { regional: string; total: number; hits: RoutingOrder[]; all: RoutingOrder[] }>()
  for (const o of orders) {
    if (!hubMap.has(o.facilityId)) hubMap.set(o.facilityId, { regional: o.regional, total: 0, hits: [], all: [] })
    const g = hubMap.get(o.facilityId)!
    g.total += 1
    g.all.push(o)
    if (matches(o)) g.hits.push(o)
  }

  const hubs: HubResumo[] = [...hubMap.entries()]
    .filter(([, g]) => g.hits.length > 0)
    .map(([facilityId, g]) => {
      const mins = g.hits.map(magnitude)
      const piorMinutos = mins.reduce((a, b) => Math.max(a, b), 0)
      const mediaMinutos = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)
      const detalhes = [...g.hits]
        .sort((a, b) => magnitude(b) - magnitude(a))
        .map((o) => ({
          collectionDate: o.collectionDate,
          routingDate: o.routingDate,
          planificationType: o.planificationType,
          publishedAt: o.publishedAt,
          deadline: o.deadline,
          minutesLate: o.minutesLate,
          durationMinutes: o.durationMinutes,
          tmrTargetMinutes: o.tmrTargetMinutes,
          tmrExcessMinutes: o.tmrExcessMinutes,
        }))
      return {
        facilityId,
        regional: g.regional,
        total: g.total,
        ocorrencias: g.hits.length,
        pct: Number(((g.hits.length / g.total) * 100).toFixed(2)),
        piorMinutos,
        mediaMinutos,
        detalhes,
        abertura: buildAberturaDiaria(g.all),
      }
    })
    .sort((a, b) => b.ocorrencias - a.ocorrencias || b.pct - a.pct)

  // Agrupamento por regional
  const regMap = new Map<string, { total: number; ocorrencias: number }>()
  for (const o of orders) {
    if (!regMap.has(o.regional)) regMap.set(o.regional, { total: 0, ocorrencias: 0 })
    const g = regMap.get(o.regional)!
    g.total += 1
    if (matches(o)) g.ocorrencias += 1
  }
  const regionais: RegionalResumo[] = [...regMap.entries()]
    .map(([regional, g]) => ({
      regional,
      total: g.total,
      ocorrencias: g.ocorrencias,
      pct: Number(((g.ocorrencias / (g.total || 1)) * 100).toFixed(2)),
    }))
    .filter((r) => r.ocorrencias > 0)
    .sort((a, b) => b.ocorrencias - a.ocorrencias)

  const totalOcorrencias = hubs.reduce((acc, h) => acc + h.ocorrencias, 0)
  const totalRoteiros = orders.length

  return {
    totalRoteiros,
    totalOcorrencias,
    pctOcorrencias: Number(((totalOcorrencias / (totalRoteiros || 1)) * 100).toFixed(2)),
    hubs,
    regionais,
  }
}

function buildHubAnalise(orders: RoutingOrder[]): HubAnalise {
  return {
    atraso: buildHubSecao(orders, "atraso"),
    estouro: buildHubSecao(orders, "estouro"),
  }
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

  // Ordena meses/semanas cronologicamente pela MENOR data de roteirização de cada
  // grupo (mesmo critério das séries), para que dez/2025 (W52) fique no início.
  const chronoLabels = (k: "month" | "week") => {
    const minDate = new Map<string, string>()
    for (const o of orders) {
      const label = o[k]
      if (!label) continue
      const cur = minDate.get(label)
      if (!cur || o.routingDate < cur) minDate.set(label, o.routingDate)
    }
    return [...minDate.keys()].sort((a, b) => {
      const da = minDate.get(a)!
      const db = minDate.get(b)!
      return da < db ? -1 : da > db ? 1 : 0
    })
  }

  return {
    kpis,
    mensal,
    semanal,
    waterfall: buildWaterfall(filtered),
    ofensores: buildOfensores(filtered),
    rangeSeveridade: buildRangeSeveridade(filtered),
    hubAnalise: buildHubAnalise(filtered),
    opcoes: {
      regionais: uniq(orders.map((o) => o.regional)),
      hubs: uniq(
        orders
          .filter((o) => filters.regional === "TODAS" || o.regional === filters.regional)
          .map((o) => o.facilityId),
      ),
      meses: chronoLabels("month"),
      semanas: chronoLabels("week"),
    },
    fonte,
  }
}
