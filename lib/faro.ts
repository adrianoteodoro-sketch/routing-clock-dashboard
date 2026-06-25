import type { RawRoutingOrder, TipoRoteirizacao } from "./types"
import { regionalForHub, ALL_HUBS, isDeactivatedHub } from "./hubs"

// ----------------------------------------------------------------------------
// Faro da Roteirização — acompanhamento em tempo real do andamento das
// roteirizações iniciadas em um dia (created_date/created_time) e sua publicação
// (RTG_ORD_STATUS + updated_time). Amarelo = iniciada / em andamento, Verde =
// publicada. Quadros separados por tipo (W-1/D-1/D-2) e, dentro de cada um, por HUB.
// ----------------------------------------------------------------------------

export type FaroStatus = "iniciada" | "publicada"

export interface FaroOrder {
  hub: string
  regional: string
  tipo: TipoRoteirizacao
  collectionDate: string // YYYY-MM-DD - dia da coleta roteirizado
  startedAt: string // ISO - início da roteirização (created_date + created_time)
  publishedAt: string // ISO - publicação (updated) ou "" se ainda não publicada
  status: FaroStatus
  statusRaw: string // valor cru de RTG_ORD_STATUS
}

export interface FaroHub {
  hub: string
  regional: string
  total: number
  iniciadas: number
  publicadas: number
  orders: FaroOrder[]
  /** True quando o HUB é esperado para o tipo mas não iniciou nenhuma roteirização no dia. */
  pendente: boolean
  /** Dias de coleta (YYYY-MM-DD) esperados pela regra e ainda não roteirizados neste HUB. */
  missingDates: string[]
}

export interface FaroTipo {
  tipo: TipoRoteirizacao
  hubs: FaroHub[]
  total: number
  iniciadas: number
  publicadas: number
  pendentes: number
}

export interface FaroData {
  date: string // dia monitorado (YYYY-MM-DD)
  generatedAt: string // ISO - quando os dados foram montados
  fonte: "bigquery" | "sheets" | "mock"
  tipos: FaroTipo[]
  total: number
  iniciadas: number
  publicadas: number
}

const TIPOS_ORDER: TipoRoteirizacao[] = ["W-1", "D-1", "D-2"]

/**
 * HUBs que hoje só são roteirizados em D-2 (exceção). Aparecem exclusivamente na
 * coluna D-2 e não constam como esperados/pendentes nas listas de W-1 ou D-1.
 */
const D2_ONLY_HUBS = new Set(["BRXMG2", "BRXSP11", "BRXMG3", "BRXBA1", "BRXPE1", "BRXCE1", "BRXPR3"])

// --- Helpers de data (YYYY-MM-DD) para calcular os dias de coleta esperados ---
function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function addDaysLocal(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}
/** Avança N dias ÚTEIS (pulando sábado/domingo). */
function addBusinessDays(d: Date, n: number): Date {
  let c = new Date(d)
  let left = n
  while (left > 0) {
    c = addDaysLocal(c, 1)
    const dow = c.getDay()
    if (dow !== 0 && dow !== 6) left -= 1
  }
  return c
}
function mondayOf(d: Date): Date {
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  return addDaysLocal(d, diff)
}
/** Dia útil anterior (pula sábado/domingo). Ex.: segunda -> sexta. */
function prevBusinessDayISO(iso: string): string {
  let d = parseISO(iso)
  if (Number.isNaN(d.getTime())) return iso
  do {
    d = addDaysLocal(d, -1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return fmtISO(d)
}

/**
 * Dias de coleta esperados (YYYY-MM-DD) para um tipo, dado o dia de roteirização.
 *  - W-1: coletas da PRÓXIMA semana (segunda a sexta).
 *  - D-1: 1 dia útil após a roteirização.
 *  - D-2: 2 dias úteis após a roteirização.
 */
function expectedCollectionDates(tipo: TipoRoteirizacao, routingISO: string): string[] {
  const routing = parseISO(routingISO)
  if (Number.isNaN(routing.getTime())) return []
  if (tipo === "W-1") {
    const nextMonday = addDaysLocal(mondayOf(routing), 7)
    return [0, 1, 2, 3, 4].map((i) => fmtISO(addDaysLocal(nextMonday, i)))
  }
  if (tipo === "D-1") return [fmtISO(addBusinessDays(routing, 1))]
  return [fmtISO(addBusinessDays(routing, 2))] // D-2
}

/** Monta um ISO local a partir de "YYYY-MM-DD" + "HH:MM:SS". */
function toIso(date: string, time: string): string {
  if (!date) return ""
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ""
  const [h = "0", m = "0", s = "0"] = (time || "00:00:00").split(":")
  d.setHours(Number.parseInt(h, 10) || 0, Number.parseInt(m, 10) || 0, Number.parseInt(s, 10) || 0, 0)
  return d.toISOString()
}

/** Detecta se a roteirização já foi publicada a partir do status + updated_time. */
function isPublished(statusRaw: string, updatedDate: string, updatedTime: string): boolean {
  const s = (statusRaw || "").toLowerCase()
  // Status explicitamente "em andamento": nunca contam como publicado,
  // mesmo que já exista updated_time preenchido.
  const inProgress = s.includes("processing") || s.includes("draft")
  if (inProgress) return false
  const publishedLike =
    s.includes("publish") ||
    s.includes("public") ||
    s.includes("finish") ||
    s.includes("complet") ||
    s.includes("clos") ||
    s.includes("conclu")
  const hasUpdate = !!updatedDate && !!updatedTime && updatedTime !== "00:00:00"
  return publishedLike || hasUpdate
}

/** Hash determinístico simples (para a simulação de andamento no preview/mock). */
function hashString(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Constrói o Faro para um dia específico (default: hoje). Considera as
 * roteirizações que INICIARAM no dia (created_date === date).
 *
 * Observação de preview: os dados mock vêm todos como "published". Para que o
 * comportamento amarelo/verde seja visível no preview, ~40% das roteirizações do
 * dia são marcadas como "em andamento" de forma determinística quando a fonte é
 * mock. Em produção (planilha real), o status vem direto de RTG_ORD_STATUS.
 */
/** Converte um valor de filtro ("TODAS"/"TODOS", "" ou "A,B") em lista; null = sem filtro. */
function parseFilterList(value: string | undefined, allLabel: string): string[] | null {
  if (!value || value === allLabel) return null
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface FaroFilters {
  regional?: string
  hub?: string
  tipo?: string
  /** Fim do intervalo de DATA DA ROTEIRIZAÇÃO (created_date). Se vazio, usa o dia único `date`. */
  dateFim?: string
  /** Início do intervalo de DATA DA COLETA (RTG_ORD_PLAN_LOCAL_DATE). Vazio = sem filtro. */
  colInicio?: string
  /** Fim do intervalo de DATA DA COLETA. Vazio = sem filtro. */
  colFim?: string
}

export function buildFaro(
  rows: RawRoutingOrder[],
  date: string,
  fonte: "bigquery" | "sheets" | "mock",
  filters?: FaroFilters,
): FaroData {
  const regionaisSel = parseFilterList(filters?.regional, "TODAS")
  const hubsSel = parseFilterList(filters?.hub, "TODOS")
  const tiposSel = parseFilterList(filters?.tipo, "TODOS")

  // Intervalo de DATA DA ROTEIRIZAÇÃO (created_date). `date` é o início;
  // `dateFim` o fim. Sem fim => dia único. Comparação lexical de "YYYY-MM-DD".
  const dateInicio = date
  const dateFim = filters?.dateFim || date

  // Intervalo de DATA DA COLETA (RTG_ORD_PLAN_LOCAL_DATE). Vazio = sem filtro.
  const colInicio = filters?.colInicio || ""
  const colFim = filters?.colFim || ""
  const hasCollectionFilter = !!colInicio || !!colFim
  const inCollectionRange = (d: string) => {
    if (colInicio && (!d || d < colInicio)) return false
    if (colFim && (!d || d > colFim)) return false
    return true
  }

  // Pendentes / datas faltantes só fazem sentido para um único dia de roteirização
  // e sem filtro de data de coleta; caso contrário, mostramos apenas o que existe.
  const computePendentes = dateInicio === dateFim && !hasCollectionFilter

  // Lookback do W-1: roteirizações semanais costumam ser publicadas no(s) dia(s)
  // anterior(es) ao dia monitorado. Para não marcar como pendente/faltante uma
  // coleta da semana esperada que já foi roteirizada na véspera, ampliamos a janela
  // de DATA DA ROTEIRIZAÇÃO do W-1 até o dia útil anterior — mas só contamos essas
  // roteirizações da véspera quando a coleta pertence à semana esperada do W-1.
  // Aplicado apenas no modo de dia único (sem intervalo/filtro de coleta).
  const applyW1Lookback = computePendentes
  const w1RoutingStart = applyW1Lookback ? prevBusinessDayISO(dateInicio) : dateInicio
  const w1Expected = new Set(expectedCollectionDates("W-1", date))

  // Mapa tipo -> hub -> FaroHub
  const tipoMap = new Map<TipoRoteirizacao, Map<string, FaroHub>>()
  for (const t of TIPOS_ORDER) tipoMap.set(t, new Map())

  for (const r of rows) {
    const created = r.created_date || ""
    if (!created) continue
    const hub = (r.SHP_FACILITY_ID || "").trim()
    if (!hub) continue
    if (isDeactivatedHub(hub)) continue // HUB desativado: fora do acompanhamento
    if (hubsSel && !hubsSel.includes(hub)) continue
    const regional = r.Regional || regionalForHub(hub)
    if (regional === "N/D") continue
    if (regionaisSel && !regionaisSel.includes(regional)) continue

    const collectionDate = r.RTG_ORD_PLAN_LOCAL_DATE || ""
    // Filtra pela DATA DA COLETA quando o intervalo está definido.
    if (!inCollectionRange(collectionDate)) continue
    // Classificação do acompanhamento:
    //  - HUBs de exceção (lista fixa) sempre D-2.
    //  - Demais HUBs pelo tipo de planejamento: tactical = W-1 (semanal), replanning = D-1.
    // Aqui NÃO se aplica a regra de exceção por data de coleta (usada no Routing Clock),
    // pois ela reclassificava roteirizações táticas (W-1) como D-2 indevidamente.
    const tipo: TipoRoteirizacao = D2_ONLY_HUBS.has(hub)
      ? "D-2"
      : r.planification_type === "tactical"
        ? "W-1"
        : "D-1"
    if (tiposSel && !tiposSel.includes(tipo)) continue

    // Janela de DATA DA ROTEIRIZAÇÃO. O W-1 admite roteirizações do dia útil
    // anterior; as demais respeitam o intervalo padrão [dateInicio, dateFim].
    const lower = tipo === "W-1" ? w1RoutingStart : dateInicio
    if (created < lower || created > dateFim) continue
    // Roteirizações do W-1 anteriores ao dia monitorado só contam quando a coleta
    // pertence à semana esperada (evita puxar coletas de semanas passadas).
    if (tipo === "W-1" && created < dateInicio && !w1Expected.has(collectionDate)) continue

    let published = isPublished(r.RTG_ORD_STATUS, r.updated_date, r.updated_time)
    // Simulação de andamento apenas no preview/mock.
    if (fonte === "mock") {
      published = hashString(`${hub}|${collectionDate}|${r.created_time}`) % 100 >= 40
    }

    const order: FaroOrder = {
      hub,
      regional,
      tipo,
      collectionDate,
      startedAt: toIso(r.created_date, r.created_time),
      publishedAt: published ? toIso(r.updated_date || r.created_date, r.updated_time) : "",
      status: published ? "publicada" : "iniciada",
      statusRaw: r.RTG_ORD_STATUS || "",
    }

    const hubMap = tipoMap.get(tipo)!
    const existing = hubMap.get(hub)
    if (existing) {
      existing.orders.push(order)
      existing.total += 1
      if (published) existing.publicadas += 1
      else existing.iniciadas += 1
    } else {
      hubMap.set(hub, {
        hub,
        regional,
        total: 1,
        iniciadas: published ? 0 : 1,
        publicadas: published ? 1 : 0,
        orders: [order],
        pendente: false,
        missingDates: [],
      })
    }
  }

  let total = 0
  let iniciadas = 0
  let publicadas = 0

  // HUBs elegíveis a cada tipo, respeitando os filtros de Regional/HUB.
  const hubEligible = (hub: string): boolean => {
    if (hubsSel && !hubsSel.includes(hub)) return false
    const reg = regionalForHub(hub)
    if (reg === "N/D") return false
    if (regionaisSel && !regionaisSel.includes(reg)) return false
    return true
  }

  const tipos: FaroTipo[] = TIPOS_ORDER.map((tipo) => {
    const hubMap = tipoMap.get(tipo)!
    const expDates = expectedCollectionDates(tipo, date)
    const skipTipo = tiposSel && !tiposSel.includes(tipo)

    if (!skipTipo && computePendentes) {
      // Universo de HUBs esperados para o tipo (D-2 só vale para os HUBs de exceção).
      const universe = (
        tipo === "D-2" ? [...D2_ONLY_HUBS] : ALL_HUBS.filter((h) => !D2_ONLY_HUBS.has(h))
      ).filter(hubEligible)
      for (const hub of universe) {
        const existing = hubMap.get(hub)
        if (existing) {
          // Datas de coleta esperadas pela regra ainda não roteirizadas neste HUB.
          const presentDates = new Set(existing.orders.map((o) => o.collectionDate))
          existing.missingDates = expDates.filter((d) => !presentDates.has(d))
        } else {
          // HUB esperado, mas sem nenhuma roteirização iniciada no dia: pendente.
          hubMap.set(hub, {
            hub,
            regional: regionalForHub(hub),
            total: 0,
            iniciadas: 0,
            publicadas: 0,
            orders: [],
            pendente: true,
            missingDates: expDates,
          })
        }
      }
    }

    const hubs = [...hubMap.values()].sort((a, b) => {
      const aActive = a.total > 0 ? 1 : 0
      const bActive = b.total > 0 ? 1 : 0
      if (aActive !== bActive) return bActive - aActive // ativos antes de pendentes
      return b.iniciadas - a.iniciadas || a.hub.localeCompare(b.hub)
    })
    // Ordena os roteiros de cada hub: em andamento primeiro, depois por coleta.
    for (const h of hubs) {
      h.orders.sort((a, b) => {
        if (a.status !== b.status) return a.status === "iniciada" ? -1 : 1
        return a.collectionDate.localeCompare(b.collectionDate)
      })
    }
    const tTotal = hubs.reduce((acc, h) => acc + h.total, 0)
    const tIni = hubs.reduce((acc, h) => acc + h.iniciadas, 0)
    const tPub = hubs.reduce((acc, h) => acc + h.publicadas, 0)
    const tPend = hubs.filter((h) => h.pendente).length
    total += tTotal
    iniciadas += tIni
    publicadas += tPub
    return { tipo, hubs, total: tTotal, iniciadas: tIni, publicadas: tPub, pendentes: tPend }
  })

  return {
    date,
    generatedAt: new Date().toISOString(),
    fonte,
    tipos,
    total,
    iniciadas,
    publicadas,
  }
}
