export type PlanificationType = "tactical" | "replanning"

/**
 * Tipo de roteirização exibido ao usuário:
 *  - "W-1": planejamento tático (tactical), roteirizado na semana anterior
 *  - "D-2": HUBs de longa distância com prazo de coleta + 3 dias úteis (exceção)
 *  - "D-1": replanning padrão (dia anterior)
 */
export type TipoRoteirizacao = "D-1" | "D-2" | "W-1"

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
  TMR_Routing: string // HH:MM - TMR médio da facility (alvo)
  TMR_Routing_Exec: string // HH:MM - TMR executado (medida de aderência ao routing clock)
}

/**
 * Linha crua da aba "Routing_Clock_D-2" (histórico do Routing By Meli 1.0,
 * coletado via formulário). Todas as linhas são tratadas como tipo "D-2".
 *  - hub: coluna B
 *  - dataColeta: coluna C ("Data da Config")
 *  - dataRoteirizacao: coluna A ("Carimbo de data/hora")
 *  - entregaNoPrazo: coluna O ("Entrega no Prazo?") -> "Entrega no prazo" = Dentro da Meta
 */
export interface D2Row {
  hub: string
  dataColeta: string // YYYY-MM-DD
  dataRoteirizacao: string // YYYY-MM-DD
  entregaNoPrazo: boolean
}

export type TmrState = "ok" | "risco" | "estouro"

/** Ordem de roteirização já classificada quanto à aderência. */
export interface RoutingOrder {
  facilityId: string
  planificationType: PlanificationType
  tipoRoteirizacao: TipoRoteirizacao // D-1 / D-2 / W-1 (derivado para exibição/filtro)
  collectionDate: string // YYYY-MM-DD - data de coleta planejada
  routingDate: string // YYYY-MM-DD - data de início da roteirização
  routingStartedAt: string // ISO - data/hora de início da roteirização (created)
  publishedAt: string // ISO - data/hora de fim da roteirização (publicação)
  deadline: string // ISO - data/hora limite de publicação
  minutesLate: number // minutos publicados após o prazo (0 se dentro do prazo)
  durationMinutes: number
  tmrMinutes: number
  tmrTargetMinutes: number
  tmrExcessMinutes: number // minutos da duração que excedem o TMR Alvo (0 se ok)
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

/** Performance e volume agregados por tipo de roteirização (W-1 / D-1 / D-2). */
export interface PerfPorTipo {
  tipo: TipoRoteirizacao
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
  hub: string
  mes: string
  semana: string
  // Tipo de roteirização: "TODOS" | "D-1" | "D-2" | "W-1"
  tipo: string
  // Filtro por data de roteirização (created_date) - "YYYY-MM-DD" ou "" (sem filtro)
  rotInicio: string
  rotFim: string
  // Filtro por data de coleta (RTG_ORD_PLAN_LOCAL_DATE) - "YYYY-MM-DD" ou ""
  coletaInicio: string
  coletaFim: string
}

export interface Kpis {
  performanceAtual: number // headline - performance de todo o período filtrado
  volumeTotal: number // headline - total de roteiros no período filtrado
  meta: number
  gapPp: number
  metaAtingida: boolean
  // Tendência semana a semana (última semana completa vs a anterior) - comparável
  perfUltimaSemana: number
  perfSemanaAnterior: number
  volumeUltimaSemana: number
  volumeSemanaAnterior: number
}

export interface DashboardOpcoes {
  regionais: string[]
  hubs: string[]
  meses: string[]
  semanas: string[]
  /** Data de roteirização mais recente disponível na base (YYYY-MM-DD), usada como filtro inicial. */
  maxRoutingDate: string
}

// ----------------------------------------------------------------------------
// Análise por HUB (aba "Análise de HUBs")
// ----------------------------------------------------------------------------

/** Um roteiro individual com problema, usado no drill-down por HUB. */
export interface HubRoteiroDetalhe {
  collectionDate: string
  routingDate: string
  planificationType: PlanificationType
  publishedAt: string
  deadline: string
  minutesLate: number
  durationMinutes: number
  tmrTargetMinutes: number
  tmrExcessMinutes: number
}

/** Abertura diária de um HUB (atraso + TMR juntos). */
export interface HubDiaResumo {
  dia: string // YYYY-MM-DD (data de coleta)
  inicioISO: string // ISO - início mais cedo da roteirização no dia ("" se sem dados)
  fimISO: string // ISO - fim mais tarde da roteirização no dia ("" se sem dados)
  total: number // roteiros do dia
  atrasos: number // roteiros fora do prazo no dia
  atrasoMedioMin: number // atraso médio (min) entre os atrasados do dia
  atrasoPiorMin: number // maior atraso (min) do dia
  tmrMedioMin: number // TMR médio (duração) do dia
  tmrAlvoMin: number // TMR alvo médio do dia
  estouros: number // roteiros com estouro de TMR no dia
  excessoPiorMin: number // maior excesso de TMR (min) do dia
}

/** Resumo de um HUB para uma das seções (Atraso ou Estouro de TMR). */
export interface HubResumo {
  facilityId: string
  regional: string
  total: number // total de roteiros do HUB no período
  ocorrencias: number // qtde de roteiros fora do prazo OU em estouro
  pct: number // ocorrencias / total * 100
  piorMinutos: number // maior atraso (min) ou maior excesso de TMR (min)
  mediaMinutos: number // média de atraso/excesso entre as ocorrências
  detalhes: HubRoteiroDetalhe[] // roteiros problemáticos (drill-down)
  abertura: HubDiaResumo[] // abertura por dia (atraso + TMR), ordenada por dia
}

/** Resumo agregado por regional para uma das seções. */
export interface RegionalResumo {
  regional: string
  total: number
  ocorrencias: number
  pct: number
}

/** Bloco completo de uma seção (Atraso ou Estouro de TMR). */
export interface HubAnaliseSecao {
  totalRoteiros: number
  totalOcorrencias: number
  pctOcorrencias: number
  hubs: HubResumo[]
  regionais: RegionalResumo[]
}

export interface HubAnalise {
  atraso: HubAnaliseSecao
  estouro: HubAnaliseSecao
}

/**
 * Registro da aba "Anomalias" da planilha: problemas ocorridos durante a
 * roteirização, com ou sem impacto no prazo (base para planos de ação).
 */
export interface Anomalia {
  registradoEm: string // YYYY-MM-DD (coluna A "Registrado em", parte de data)
  dataColeta: string // YYYY-MM-DD (coluna B)
  hub: string // coluna D
  regional: string // derivada do HUB
  tipoRoteirizacao: string // coluna E (W-1 / D-1 / D-2)
  problema: string // coluna F "Informe o Problema Encontrado"
  houveAtraso: boolean // coluna G "Houve atraso na roteirização?" (Sim/Não)
  descricao: string // coluna I
}

/** Anomalias agrupadas por categoria de problema, separando com/sem atraso. */
export interface AnomaliaCategoria {
  problema: string
  comAtraso: number
  semAtraso: number
  total: number
}

/** Resumo das anomalias do período filtrado para exibição ao lado do waterfall. */
export interface AnomaliasResumo {
  total: number
  comAtraso: number // afetaram a performance (geraram atraso)
  semAtraso: number // ocorreram durante o dia, sem gerar atraso
  categorias: AnomaliaCategoria[]
}

export interface DashboardData {
  kpis: Kpis
  mensal: SeriePonto[]
  semanal: SeriePonto[]
  performancePorTipo: PerfPorTipo[]
  waterfall: WaterfallPonto[]
  anomalias: AnomaliasResumo
  ofensores: Ofensor[]
  rangeSeveridade: RangeSeveridade[]
  hubAnalise: HubAnalise
  opcoes: DashboardOpcoes
  fonte: "bigquery" | "sheets" | "mock"
}
