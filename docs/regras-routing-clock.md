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
- **D-1 (replanning):** dia útil anterior à coleta às **17:00**
  (seg→sex anterior; sábado→quarta anterior).
- **D-2 (exceção/longa distância):** HUBs em `DEADLINE_EXCEPTIONS` → prazo por
  **dias úteis + hora** configurados (têm prioridade sobre a regra padrão).
- **Histórico D-2 (formulário):** usa direto o desfecho
  "Entrega no prazo / fora do prazo".

---

## 7. Classificação do tipo

- HUB de exceção → `D-2`;
- `tactical` → `W-1`;
- `replanning` → `D-1`.
