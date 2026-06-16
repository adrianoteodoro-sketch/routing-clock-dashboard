// Mapeamento HUB (SHP_FACILITY_ID) -> Regional, conforme cadastro First Mile.
export const HUB_TO_REGIONAL: Record<string, string> = {
  XSP4: "MEGAS",
  BRXSP16: "MEGAS",
  ARENA: "MEGAS",
  BRXSP10: "MEGAS",
  BRXSP18: "MEGAS",
  BRXBA1: "NONECO",
  BRXPE1: "NONECO",
  BRXCE1: "NONECO",
  BRXGO1: "NONECO",
  BRXES1: "RIMES",
  BRXMG2: "RIMES",
  XMG1: "RIMES",
  BRRJ02: "RIMES",
  BRXSP7: "SPIO",
  BRXPR2: "SPIO",
  BRXSP14: "SPIO",
  BRXMG3: "SPIO",
  BRXSP11: "SPIO",
  BRXPR4: "SPIO",
  CAMPINAS: "SPIO",
  BRXSP5: "SPIO",
  BRPR01: "SUL",
  BRXSC2: "SUL",
  BRXPR3: "SUL",
  BRXRS1: "SUL",
}

/** Lista de HUBs (facilities) conhecidos. */
export const ALL_HUBS = Object.keys(HUB_TO_REGIONAL)

/** Lista única de regionais. */
export const ALL_REGIONAIS = [...new Set(Object.values(HUB_TO_REGIONAL))].sort()

/** Retorna a regional de um HUB; "N/D" quando não mapeado. */
export function regionalForHub(hub: string): string {
  return HUB_TO_REGIONAL[hub] ?? "N/D"
}
