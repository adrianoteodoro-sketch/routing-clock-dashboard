# Regras de Cálculo — Routing Clock

Especificação das regras usadas para calcular a **performance** (resultado semanal/mensal)
e a **quantidade de roteiros executados** (volume) do Routing Clock.

> Fonte da verdade da implementação: `lib/routing-clock.ts`.

---

## 1. Definições base

- **Meta de performance:** `95%` (`META_PERFORMANCE`).
- **Roteiro aderente:** roteiro **publicado dentro do prazo** de entrega (`publishedAt <= deadline`).
  O TMR (`TMR_Routing` / `TMR_Routing_Exec`) é **apenas sinal de risco/ofensor** — **não** afeta a aderência.
- **Regional:** vem da coluna da planilha/query; se ausente, é derivada do HUB.
  HUB sem regional mapeada (ex.: `BRXSP6`) é **descartado**.
- **Sem regra de prazo** (ex.: coleta no domingo) → roteiro **descartado**
  (não entra em volume nem em performance).

---

## 2. Performance (resultado do Routing Clock)

```
Performance = (roteiros aderentes / total de roteiros) * 100
```

- Calculada sobre o conjunto **já filtrado** (regional, HUB, tipo, mês, semana,
  data de coleta, data de roteirização).
- Arredondada para 2 casas decimais.

---

## 3. Quantidade de roteiros executados (Volume)

- **Volume = contagem de roteiros** no conjunto filtrado (`orders.length`).
- **Toda operação presente nos dados conta** (todas iniciaram a roteirização),
  exceto os descartes da Regra 1.

---

## 4. Agrupamento temporal (semana e mês)

A âncora de tempo é a **data de roteirização** (criação do roteiro), **não** a data de coleta:

- **Fonte principal:** `created_date` (`date_created` como fallback para `routingDate`).
- **Histórico D-2 (formulário):** usa `dataRoteirizacao`; se vazia, `dataColeta`.
- **Mês:** `"AAAA/M"` → `ano/(mês+1)` da data-âncora.
- **Semana:** `"Wxx"` → número da **semana ISO** da data-âncora.

---

## 5. Séries semanal/mensal

- Agrupa os roteiros por `week` ou `month`.
- Cada ponto expõe: `performance` (Regra 2 do grupo), `volume` (contagem do grupo)
  e `meta` (95%).
- **Ordenação cronológica** pela **menor data de roteirização** do grupo
  (evita erro na virada de ano, ex.: `W52` de dez/2025 antes das semanas de 2026).

---

## 6. Prazos de publicação (define aderência)

- **W-1 (tactical):**
  - coleta seg/ter → **quarta 18:00** da semana vigente;
  - coleta qua/qui/sex → **quinta 18:00**;
  - sábado (excepcional) → **quarta 18:00**.
- **D-1 (replanning):** dia útil anterior à coleta às **17:00**.
  - As coletas de **sábado podem ser roteirizadas no D-1**;
  - nesse caso, a roteirização deve ser entregue até **sexta-feira às 17:00**;
  - para as demais coletas, considera-se o dia útil anterior à coleta, também às **17:00**.
- **D-2 (exceção/longa distância):** HUBs em `DEADLINE_EXCEPTIONS` → prazo por
  **dias úteis + hora** configurados (têm prioridade sobre a regra padrão).
- **Histórico D-2 (formulário):** usa direto o desfecho
  "Entrega no prazo / fora do prazo".

---

## 7. Classificação do tipo

- HUB de exceção → `D-2`;
- `tactical` → `W-1`;
- `replanning` → `D-1`.

---

# Guia de Replicação

Esta parte complementa as regras acima com tudo que é necessário para **reproduzir o
dashboard em outro projeto**: de onde os dados vêm, como as colunas são mapeadas e quais
configurações fixas existem no código. As regras 1–7 descrevem a *matemática*; esta seção
descreve a *infraestrutura de dados* em volta delas.

## 8. Fonte de dados e variáveis de ambiente

Os dados são lidos do **Google Sheets** via API (Service Account). Arquivos:
`lib/google-sheets.ts` (leitura/parse) e rotas `app/api/routing-clock/route.ts` e
`app/api/faro/route.ts` (`dynamic = "force-dynamic"`, leem a planilha a cada request).

Variáveis de ambiente necessárias:

| Variável | Descrição |
| --- | --- |
| `GOOGLE_SHEET_ID` | ID (ou URL) da planilha do Routing Clock. |
| `GOOGLE_SERVICE_ACCOUNT_*` | Credenciais da Service Account com acesso de leitura à planilha. |

A planilha tem **3 abas** relevantes:

1. **Aba principal (roteirizações)** — primeira aba legível do tipo `GRID`
   (abas `DATA_SOURCE`/Connected Sheet do BigQuery são ignoradas). Cabeçalhos por **nome**.
2. **`Anomalias`** — problemas registrados na roteirização. Cabeçalhos por **posição**.
3. **`Routing_Clock_D-2`** — histórico RBM 1.0 (D-2 via formulário). Cabeçalhos por **posição**.

## 9. Dicionário de colunas

### 9.1 Aba principal (mapeada por NOME de cabeçalho)

| Coluna na planilha | Campo interno | Uso |
| --- | --- | --- |
| `created_date` | `created_date` | Data da roteirização (âncora de tempo — Regra 4). |
| `date_created` | `date_created` | Data da roteirização dedicada; fallback = `created_date`. |
| `created_time` | `created_time` | Hora de início da roteirização. |
| `updated_date` | `updated_date` | Data de publicação. |
| `updated_time` | `updated_time` | Hora de publicação (exibida nos chips do Acompanhamento). |
| `time_to_update` | `time_to_update` | Duração da roteirização (HH:MM). |
| `SHP_FACILITY_ID` | `SHP_FACILITY_ID` | HUB/facility (linha sem facility é descartada). |
| `Regional` | `Regional` | Regional; se vazia, derivada do HUB (ver §10). |
| `RTG_ORD_PLAN_LOCAL_DATE` | `RTG_ORD_PLAN_LOCAL_DATE` | Data da coleta (base dos prazos e do filtro de coleta). |
| `RTG_ORD_STATUS` | `RTG_ORD_STATUS` | Status do roteiro. |
| `planification_type` | `planification_type` | `tactical` / `replanning` (default `tactical`). |
| `TMR_Routing` | `TMR_Routing` | TMR planejado (HH:MM) — sinal de risco, não afeta aderência. |
| `TMR_Routing_Exec` | `TMR_Routing_Exec` | TMR executado (HH:MM) — sinal de risco. |

### 9.2 Aba `Anomalias` (mapeada por POSIÇÃO — range `A:I`)

| Col. | Campo | Uso |
| --- | --- | --- |
| A (0) | `registradoEm` | Data de registro (âncora de mês/semana/data de roteirização dos filtros). |
| B (1) | `dataColeta` | Data da coleta (filtro de coleta). |
| D (3) | `hub` | HUB. |
| E (4) | `tipoRoteirizacao` | Tipo (filtro de tipo). |
| F (5) | `problema` | Categoria do problema (agrupamento do gráfico). |
| G (6) | `houveAtraso` | "Sim"/"Não" → com/sem atraso. |
| I (8) | `descricao` | Descrição livre. |

### 9.3 Aba `Routing_Clock_D-2` (mapeada por POSIÇÃO — range `A:R`)

| Col. | Campo | Uso |
| --- | --- | --- |
| A (0) | `dataRoteirizacao` | Data da roteirização (âncora de tempo; fallback = coleta). |
| B (1) | `hub` | HUB. |
| C (2) | `dataColeta` | Data da coleta. |
| O (14) | `entregaNoPrazo` | "Entrega no prazo" = aderente; contém "fora" = não aderente. |

## 10. Configuração fixa no código

### 10.1 `HUB_TO_REGIONAL` (`lib/hubs.ts`)

Mapa **HUB → Regional**. Regionais: `MEGAS`, `NONECO`, `RIMES`, `SPIO`, `SUL`.
HUB sem entrada no mapa retorna `N/D` e é descartado (Regra 1).
Ajustes atuais notáveis: `CAMPINAS = MEGAS`, `BRXSP5 = SPIO`.

- **`DEACTIVATED_HUBS`**: `["BRXSP6"]` — mantido no mapa para preservar histórico,
  mas removido dos filtros, do universo de HUBs esperados e da tela de Acompanhamento.

### 10.2 `DEADLINE_EXCEPTIONS` (`lib/routing-clock-exceptions.ts`)

Exceções de prazo (têm prioridade sobre o prazo padrão — Regra 6). Cada exceção define
`hubs`, opcionalmente intervalo de datas de coleta (`deData`/`ateData`) e tipos, e a regra
`prazo = coleta + N dias úteis, às HH:MM` (fins de semana são pulados).

- Exceção ativa (D-2, longa distância): `coleta + 3 dias úteis às 17:00` para
  `BRXMG2, BRXSP7, BRXSP11, BRXMG3, BRXBA1, BRXPE1, BRXCE1, BRXPR3`.

## 11. Checklist para replicar em outro projeto

1. Criar a planilha com as 3 abas e as colunas do §9 (nomes exatos na aba principal;
   posições exatas nas abas `Anomalias` e `Routing_Clock_D-2`).
2. Configurar `GOOGLE_SHEET_ID` e as credenciais da Service Account (§8).
3. Copiar/adaptar `lib/hubs.ts` (mapa HUB→Regional e HUBs desativados — §10.1).
4. Copiar/adaptar `lib/routing-clock-exceptions.ts` (exceções de prazo — §10.2).
5. Manter as regras 1–7 em `lib/routing-clock.ts` (cálculo de performance, volume,
   agrupamento e prazos).
6. Expor as rotas `force-dynamic` para leitura a cada request.
