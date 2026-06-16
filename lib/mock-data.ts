import type { RawRoutingOrder, PlanificationType } from "./types"
import { getDeadline } from "./routing-clock"
import { ALL_HUBS, regionalForHub } from "./hubs"

// Geração determinística de dados de exemplo no MESMO formato da query do BigQuery.
// Usado apenas no preview (fora do perímetro VPC). Em produção a query real substitui.

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function minutesToHHMM(min: number) {
  const total = Math.round(min)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function minutesToHHMMSS(min: number) {
  const totalSeconds = Math.round(min * 60)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/**
 * Gera ~N ordens de roteirização first_mile entre fev e jun/2026.
 * Cada facility tem um TMR base; a duração varia em torno dele,
 * e o horário de publicação respeita (ou estoura) o prazo conforme um fator.
 */
export function generateMockRows(count = 6000): RawRoutingOrder[] {
  const rand = mulberry32(20260601)
  const rows: RawRoutingOrder[] = []

  // TMR base por facility (em minutos), usando os HUBs reais do cadastro First Mile.
  const facilities: { id: string; tmr: number }[] = ALL_HUBS.map((id) => ({
    id,
    tmr: 90 + Math.floor(rand() * 90), // 90 a 180 min
  }))

  const start = new Date("2026-02-02T00:00:00") // segunda-feira
  const totalDays = 140 // ~20 semanas

  for (let i = 0; i < count; i++) {
    const f = facilities[Math.floor(rand() * facilities.length)]
    const tmrTarget = f.tmr * 1.3

    // Data de coleta dentro do período (preferindo dias úteis)
    const dayOffset = Math.floor(rand() * totalDays)
    const collection = new Date(start)
    collection.setDate(collection.getDate() + dayOffset)
    const dow = collection.getDay()
    if (dow === 0) collection.setDate(collection.getDate() + 1) // evita domingo

    const planificationType: PlanificationType = rand() < 0.7 ? "tactical" : "replanning"

    // Prazo real (dia/hora limite) conforme as regras do Routing Clock.
    const deadline = getDeadline(collection, planificationType)
    if (!deadline) continue // dia de coleta sem regra (ex.: domingo) -> ignora

    // Duração da roteirização: maioria dentro do TMR, alguns em risco/estouro
    const r = rand()
    let duration: number
    if (r < 0.78) duration = f.tmr * (0.6 + rand() * 0.35) // dentro do TMR
    else if (r < 0.9) duration = f.tmr * (1 + rand() * 0.14) // risco (entre TMR e alvo)
    else duration = tmrTarget * (1 + rand() * 0.5) // estouro

    // Publicação ancorada no prazo: ~96% dentro do prazo, ~4% estouram.
    const publishedAt = new Date(deadline)
    if (rand() < 0.96) {
      // publica de 0 a 26h antes do prazo
      publishedAt.setMinutes(publishedAt.getMinutes() - Math.floor(rand() * 26 * 60))
    } else {
      // publica de 0 a 8h depois do prazo (fora do prazo)
      publishedAt.setMinutes(publishedAt.getMinutes() + Math.floor(rand() * 8 * 60))
    }

    // Início (created) = publicação menos a duração da roteirização
    const created = new Date(publishedAt)
    created.setMinutes(created.getMinutes() - Math.round(duration))

    const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()
    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    rows.push({
      created_date: fmtDate(created),
      created_time: minutesToHHMMSS(minuteOfDay(created)),
      updated_date: fmtDate(publishedAt),
      updated_time: minutesToHHMMSS(minuteOfDay(publishedAt)),
      time_to_update: minutesToHHMM(duration),
      SHP_FACILITY_ID: f.id,
      Regional: regionalForHub(f.id),
      RTG_ORD_PLAN_LOCAL_DATE: fmtDate(collection),
      RTG_ORD_STATUS: "published",
      date_created: fmtDate(created),
      planification_type: planificationType,
      TMR_Routing: minutesToHHMM(f.tmr),
      TMR_Routing_30pct: minutesToHHMM(tmrTarget),
    })
  }

  return rows
}
