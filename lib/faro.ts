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
  timeToUpdate: string // HH:MM - duração da roteirização (coluna time_to_update)
  updatedTime: string // HH:MM - horário de atualização (coluna updated_time)
  status: FaroStatus
  statusRaw: string // valor cru de RTG_ORD_STATUS
  /** True quando o roteiro foi feito fora da meta (ex.: W-1 de seg/ter roteirizado na quinta). */
  late: boolean
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
  /**
   * Subconjunto de coletas faltantes cujo prazo de roteirização já passou
   * (ex.: W-1 de segunda/terça não roteirizado até quarta). Exibidas em vermelho.
   */
  overdueDates: string[]
  /** Roteiros necessários para finalizar o tipo neste HUB (base do percentual). */
  necessarias: number
  /** Roteiros necessários já concluídos (publicados). */
  concluidas: number
}

export interface FaroTipo {
  tipo: TipoRoteirizacao
  hubs: FaroHub[]
  total: number
  iniciadas: number
  publicadas: number
  pendentes: number
  /** Total de roteiros necessários para finalizar o tipo (base do percentual). */
  necessarias: number
  /** Roteiros necessários já concluídos (publicados). */
  concluidas: number
}

export interface FaroData {
  date: string // dia monitorado (YYYY-MM-DD)
  generatedAt: string // ISO - quando os dados foram montados
  fonte: "bigquery" | "sheets" | "mock"
  tipos: FaroTipo[]
  total: number
  iniciadas: number
  publicadas: number
  /** Total de roteiros necessários (todos os tipos) — base do percentual geral. */
  necessarias: number
  /** Roteiros necessários já concluídos (publicados). */
  concluidas: number
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

/**
 * Prazo de roteirização (dia da semana, 0=dom..6=sáb) de uma coleta do W-1:
 *  - Coletas de SEGUNDA/TERÇA são roteirizadas até a QUARTA (3) da semana anterior.
 *  - Coletas de QUARTA/QUINTA/SEXTA são roteirizadas até a QUINTA (4).
 */
function w1DeadlineDow(collectionISO: string): number {
  const dow = parseISO(collectionISO).getDay() // 1=seg..5=sex
  return dow <= 2 ? 3 : 4
}

/**
 * Separa as coletas faltantes do W-1 em "no prazo" (cinza) e "atrasadas" (vermelho).
 * Uma coleta está atrasada quando o dia da semana monitorado já passou do prazo
 * de roteirização dela (ex.: segunda/terça não feitas e hoje já é quinta).
 */
function splitW1Missing(dates: string[], monitoredDow: number): { missing: string[]; overdue: string[] } {
  const missing: string[] = []
  const overdue: string[] = []
  for (const d of dates) {
    if (monitoredDow > w1DeadlineDow(d)) overdue.push(d)
    else missing.push(d)
  }
  return { missing, overdue }
}

/**
 * Um roteiro do W-1 foi feito fora da meta quando o dia da semana em que foi
 * roteirizado (created_date) é posterior ao prazo da coleta. Ex.: coleta de
 * segunda/terça (prazo quarta) roteirizada na quinta-feira.
 */
function isW1OrderLate(collectionISO: string, createdISO: string): boolean {
  if (!collectionISO || !createdISO) return false
  const createdDow = parseISO(createdISO).getDay()
  // Considera apenas dias úteis de roteirização (seg-sex) para evitar ruído.
  if (createdDow === 0 || createdDow === 6) return false
  return createdDow > w1DeadlineDow(collectionISO)
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

/**
 * Detecta se a roteirização já foi publicada.
 * Regra: SOMENTE o status "published" (em RTG_ORD_STATUS) conta como publicado.
 * Qualquer outro status (processing, draft, etc.) é considerado EM ANDAMENTO.
 */
function isPublished(statusRaw: string): boolean {
  return (statusRaw || "").trim().toLowerCase() === "published"
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
  /** Lista de HUBs SEM replan (D-1). Esses HUBs não contam D-1 no percentual. */
  semReplan?: string
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
  // HUBs SEM replan (D-1): default é COM replan, então essa lista marca exceções.
  const semReplanSet = new Set(
    (filters?.semReplan || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )

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
  // Dia da semana do dia monitorado (para decidir o que está "atrasado" no W-1).
  const monitoredDow = parseISO(date).getDay()

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
    // O mapa canônico (HUB_TO_REGIONAL) é a fonte de verdade; a planilha/BigQuery
    // é usada apenas quando o HUB não está mapeado no código.
    const mapped = regionalForHub(hub)
    const regional = mapped !== "N/D" ? mapped : r.Regional
    if (!regional || regional === "N/D") continue
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

    let published = isPublished(r.RTG_ORD_STATUS)
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
      timeToUpdate: (r.time_to_update || "").trim(),
      updatedTime: (r.updated_time || "").trim().slice(0, 5),
      status: published ? "publicada" : "iniciada",
      statusRaw: r.RTG_ORD_STATUS || "",
      // Fora da meta: só faz sentido no W-1 e no modo de dia único.
      late: tipo === "W-1" && computePendentes && isW1OrderLate(collectionDate, created),
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
        overdueDates: [],
        necessarias: 0,
        concluidas: 0,
      })
    }
  }

  let total = 0
  let iniciadas = 0
  let publicadas = 0
  let necessarias = 0
  let concluidas = 0

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
      // Universo de HUBs esperados para o tipo:
      //  - D-2: apenas os HUBs de exceção.
      //  - D-1: todos os HUBs (exceto exceção) que TÊM replan (não estão em semReplan).
      //  - W-1: todos os HUBs (exceto exceção).
      const universe = (
        tipo === "D-2"
          ? [...D2_ONLY_HUBS]
          : ALL_HUBS.filter((h) => !D2_ONLY_HUBS.has(h) && !(tipo === "D-1" && semReplanSet.has(h)))
      ).filter(hubEligible)
      for (const hub of universe) {
        const existing = hubMap.get(hub)
        if (existing) {
          // Datas de coleta esperadas pela regra ainda não roteirizadas neste HUB.
          const present = new Set(existing.orders.map((o) => o.collectionDate))
          const faltantes = expDates.filter((d) => !present.has(d))
          if (tipo === "W-1") {
            const { missing, overdue } = splitW1Missing(faltantes, monitoredDow)
            existing.missingDates = missing
            existing.overdueDates = overdue
          } else {
            existing.missingDates = faltantes
          }
        } else {
          // HUB esperado, mas sem nenhuma roteirização iniciada no dia: pendente.
          const { missing, overdue } =
            tipo === "W-1" ? splitW1Missing(expDates, monitoredDow) : { missing: expDates, overdue: [] }
          hubMap.set(hub, {
            hub,
            regional: regionalForHub(hub),
            total: 0,
            iniciadas: 0,
            publicadas: 0,
            orders: [],
            pendente: true,
            missingDates: missing,
            overdueDates: overdue,
            necessarias: 0,
            concluidas: 0,
          })
        }
      }
    }

    // Ordenação: do topo (mais roteiros faltantes/atrasados) para baixo (mais feitos).
    // Atrasados pesam mais para que os HUBs em vermelho fiquem no topo.
    // Classificação: HUBs com mais operações PENDENTES primeiro, depois mais
    // EM ANDAMENTO, depois mais FINALIZADAS.
    const pendentesOf = (h: FaroHub) =>
      h.overdueDates.length + h.missingDates.length + (h.pendente ? 1 : 0)
    const hubs = [...hubMap.values()].sort((a, b) => {
      const pend = pendentesOf(b) - pendentesOf(a) // mais pendentes primeiro
      if (pend !== 0) return pend
      const andamento = b.iniciadas - a.iniciadas // mais em andamento depois
      if (andamento !== 0) return andamento
      const finalizadas = b.publicadas - a.publicadas // mais finalizadas por último
      if (finalizadas !== 0) return finalizadas
      return a.hub.localeCompare(b.hub)
    })
    // Ordena os roteiros de cada hub: em andamento primeiro, depois por coleta.
    for (const h of hubs) {
      h.orders.sort((a, b) => {
        if (a.status !== b.status) return a.status === "iniciada" ? -1 : 1
        return a.collectionDate.localeCompare(b.collectionDate)
      })
    }

    // Progresso (base do percentual): roteiros necessários x concluídos.
    //  - W-1: cada um dos dias de coleta esperados conta como um roteiro necessário.
    //  - D-1: 1 roteiro esperado por HUB COM replan (HUBs sem replan não contam).
    //  - D-2: 1 roteiro esperado por HUB de exceção.
    // Em modo intervalo/coleta (sem pendentes) usamos a contagem bruta de roteiros.
    for (const h of hubs) {
      const noReplan = tipo === "D-1" && semReplanSet.has(h.hub)
      if (noReplan) {
        h.necessarias = 0
        h.concluidas = 0
      } else if (!computePendentes) {
        h.necessarias = h.total
        h.concluidas = h.publicadas
      } else if (tipo === "W-1") {
        const pub = new Set(h.orders.filter((o) => o.status === "publicada").map((o) => o.collectionDate))
        h.necessarias = expDates.length
        h.concluidas = expDates.filter((d) => pub.has(d)).length
      } else {
        // D-1 (com replan) e D-2: 1 roteiro necessário; concluído se houver publicação.
        h.necessarias = 1
        h.concluidas = h.publicadas > 0 ? 1 : 0
      }
    }

    const tTotal = hubs.reduce((acc, h) => acc + h.total, 0)
    const tIni = hubs.reduce((acc, h) => acc + h.iniciadas, 0)
    const tPub = hubs.reduce((acc, h) => acc + h.publicadas, 0)
    const tPend = hubs.filter((h) => h.pendente).length
    const tNec = hubs.reduce((acc, h) => acc + h.necessarias, 0)
    const tConc = hubs.reduce((acc, h) => acc + h.concluidas, 0)
    total += tTotal
    iniciadas += tIni
    publicadas += tPub
    necessarias += tNec
    concluidas += tConc
    return {
      tipo,
      hubs,
      total: tTotal,
      iniciadas: tIni,
      publicadas: tPub,
      pendentes: tPend,
      necessarias: tNec,
      concluidas: tConc,
    }
  })

  return {
    date,
    generatedAt: new Date().toISOString(),
    fonte,
    tipos,
    total,
    iniciadas,
    publicadas,
    necessarias,
    concluidas,
  }
}
