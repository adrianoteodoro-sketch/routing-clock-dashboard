// ----------------------------------------------------------------------------
// Exceções à regra padrão de Routing Clock (lista fixa, gerenciada no código)
// ----------------------------------------------------------------------------
//
// Cada exceção pode restringir por HUB/facility e/ou por intervalo de datas de
// coleta, e define um prazo de entrega alternativo ao padrão (getDeadline).
//
// Para adicionar uma nova exceção, inclua um objeto no array DEADLINE_EXCEPTIONS.

export type DeadlineException = {
  /** Rótulo livre para identificar a exceção. */
  descricao: string
  /** HUBs/facilities afetados. Use "*" para todos. */
  hubs: string[] | "*"
  /**
   * Intervalo de datas de COLETA (YYYY-MM-DD) em que a exceção vale, inclusive.
   * Omita para valer sempre.
   */
  deData?: string
  ateData?: string
  /**
   * Tipos de planificação afetados. Omita para valer para ambos
   * ("tactical" e "replanning").
   */
  tipos?: Array<"tactical" | "replanning">
  /**
   * Regra de prazo alternativa: prazo = coleta + N dias ÚTEIS, na hora indicada.
   * Ex.: regraDiasUteis = 3, hora = 17 -> 3 dias úteis após a coleta, às 17:00.
   */
  regraDiasUteis: number
  hora: number
  minuto?: number
}

/**
 * Exceção "D-2" para HUBs de longa distância: o roteiro coletado tem prazo de
 * 3 dias úteis após a coleta, sempre às 17:00 (fins de semana são pulados):
 *   - Coleta segunda  -> entrega quinta 17:00
 *   - Coleta terça    -> entrega sexta 17:00
 *   - Coleta quarta   -> entrega segunda 17:00
 *   - Coleta quinta   -> entrega terça 17:00
 *   - Coleta sexta    -> entrega quarta 17:00
 */
export const DEADLINE_EXCEPTIONS: DeadlineException[] = [
  {
    descricao: "HUBs longa distância (D-2): coleta + 3 dias úteis às 17:00",
    hubs: ["BRXMG2", "BRXSP7", "BRXSP11", "BRXMG3", "BRXBA1", "BRXPE1", "BRXCE1", "BRXPR3"],
    regraDiasUteis: 3,
    hora: 17,
    minuto: 0,
  },
]
