export type PlanificationType = "tactical" | "replanning"

/** Linha crua retornada pela query do BigQuery (ou pelo mock no preview). */
export interface RawRoutingOrder {
  created_date: string // YYYY-MM-DD - início da roteirização
  created_time: string // HH:MM:SS
  updated_date: string // YYYY-MM-DD - publicação do roteiro
  updated_time: string // HH:MM:SS
  time_to_update: string // HH:MM - duração da roteirização
  SHP_FACILITY_ID: string
  Regional: string // Regional derivada do HUB via CASE na própria query
  RTG_ORD_PLAN_LOCAL_DATE: string // YYYY-MM-DD - data de coleta planejada
  RTG_ORD_STATUS: string
  date_created: string
  planification_type: PlanificationType
  TMR_Routing: string // HH:MM - TMR médio da facility
  TMR_Routing_30pct: string // HH:MM - TMR alvo (TMR x 1.30)
}

export type TmrState = "ok" | "risco" | "estouro"

/** Ordem de roteirização já classificada quanto à aderência. */
export interface RoutingOrder {
  facilityId: string
  planificationType: PlanificationType
  collectionDate: string // YYYY-MM-DD - data de coleta planejada
  routingDate: string // YYYY-MM-DD - data de início da roteirização
  publishedAt: string
  durationMinutes: number
  tmrMinutes: number
  tmrTargetMinutes: number
  tmrState: TmrState
  withinDeadline: boolean
  isAdherent: boolean
  regional: string
  month: string // "YYYY/M"
  week: string // "Wxx"
  reason: string
}

export interface SeriePonto {
  label: string
  performance: number
  volume: number
  meta: number
}

export interface WaterfallPonto {
  label: string
  valor: number
  acumulado: number
  tipo: "inicio" | "perda" | "total"
}

export interface Ofensor {
  facilityId: string
  reason: string
  ocorrencias: number
  pctImpacto: number
}

export type Severidade = "baixa" | "media" | "alta"

export interface RangeSeveridade {
  faixa: string
  ocorrencias: number
  severidade: Severidade
}

export interface Filters {
  regional: string
  mes: string
  semana: string
  // Filtro por data de roteirização (created_date) - "YYYY-MM-DD" ou "" (sem filtro)
  rotInicio: string
  rotFim: string
  // Filtro por data de coleta (RTG_ORD_PLAN_LOCAL_DATE) - "YYYY-MM-DD" ou ""
  coletaInicio: string
  coletaFim: string
}

export interface Kpis {
  performanceAtual: number
  performanceAnterior: number
  volumeTotal: number
  volumeAnterior: number
  meta: number
  gapPp: number
  metaAtingida: boolean
}

export interface DashboardOpcoes {
  regionais: string[]
  meses: string[]
  semanas: string[]
}

export interface DashboardData {
  kpis: Kpis
  mensal: SeriePonto[]
  semanal: SeriePonto[]
  waterfall: WaterfallPonto[]
  ofensores: Ofensor[]
  rangeSeveridade: RangeSeveridade[]
  opcoes: DashboardOpcoes
  fonte: "bigquery" | "mock"
}
