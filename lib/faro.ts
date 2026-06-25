import type { RawRoutingOrder, TipoRoteirizacao } from "./types"
import { regionalForHub } from "./hubs"
import { getTipoRoteirizacao } from "./routing-clock"

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
}

export interface FaroTipo {
  tipo: TipoRoteirizacao
  hubs: FaroHub[]
  total: number
  iniciadas: number
  publicadas: number
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
export function buildFaro(
  rows: RawRoutingOrder[],
  date: string,
  fonte: "bigquery" | "sheets" | "mock",
): FaroData {
  // Mapa tipo -> hub -> FaroHub
  const tipoMap = new Map<TipoRoteirizacao, Map<string, FaroHub>>()
  for (const t of TIPOS_ORDER) tipoMap.set(t, new Map())

  for (const r of rows) {
    // Filtra pelas roteirizações iniciadas no dia monitorado.
    if ((r.created_date || "") !== date) continue
    const hub = (r.SHP_FACILITY_ID || "").trim()
    if (!hub) continue
    const regional = r.Regional || regionalForHub(hub)
    if (regional === "N/D") continue

    const collectionDate = r.RTG_ORD_PLAN_LOCAL_DATE || ""
    const colDate = new Date(`${collectionDate || r.created_date}T00:00:00`)
    const tipo = getTipoRoteirizacao(hub, colDate, r.planification_type)

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
      })
    }
  }

  let total = 0
  let iniciadas = 0
  let publicadas = 0

  const tipos: FaroTipo[] = TIPOS_ORDER.map((tipo) => {
    const hubs = [...tipoMap.get(tipo)!.values()].sort(
      (a, b) => b.iniciadas - a.iniciadas || a.hub.localeCompare(b.hub),
    )
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
    total += tTotal
    iniciadas += tIni
    publicadas += tPub
    return { tipo, hubs, total: tTotal, iniciadas: tIni, publicadas: tPub }
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
