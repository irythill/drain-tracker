# Modelo de Dados — Spec

**Status:** Ativa
**Tipo:** Spec-anchored
**Depende de:** `specs/dominio-financeiro.md`

Schema executável em `db/schema.ts`. Este documento explica o **porquê** de
cada decisão; o arquivo TypeScript é a fonte da verdade sintática.

---

## Entidades

```
contas ──────┐
             ├──< lancamentos >── categorias
parcelamentos ┘        │
                       └── (parcelamento_id, numero_parcela)

orcamentos_mensais   (ano, mes)  — independente

dividas ──< pagamentos_divida

importacoes ──< lancamentos (importacao_id)
```

---

## Enums

| Enum | Valores |
|---|---|
| `tipo_conta` | `conta`, `cartao` |
| `tipo_transacao` | `receita`, `despesa` |
| `grupo_orcamento` | `necessidade`, `desejo`, `poupanca_divida` |
| `forma_pagamento` | `debito`, `credito`, `pix`, `dinheiro`, `boleto` |
| `status_transacao` | `pago`, `pendente` |

Enums de verdade no Postgres, não `text` com `CHECK`. Adicionar valor exige
migration — o que é bom: obriga a pensar no impacto.

---

## `contas`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `nome` | `text` NOT NULL UNIQUE | |
| `tipo` | `tipo_conta` NOT NULL | informativo no v1 |
| `dia_fechamento` | `integer` NULL | reservado, não usar no v1 |
| `dia_vencimento` | `integer` NULL | reservado, não usar no v1 |
| `arquivada` | `boolean` NOT NULL DEFAULT false | |
| `created_at` | `timestamptz` DEFAULT now() | |

Seed: Nubank (`cartao`), PicPay (`cartao`), Inter (`conta`), Itaú (`conta`),
Renner (`cartao`), Shopee (`cartao`), Dinheiro (`conta`).

## `categorias`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `nome` | `text` NOT NULL | |
| `tipo` | `tipo_transacao` NOT NULL | |
| `grupo` | `grupo_orcamento` NULL | NOT NULL quando `tipo = despesa` |
| `arquivada` | `boolean` NOT NULL DEFAULT false | |

- `UNIQUE (nome, tipo)` — pode existir "Outros" de receita e "Outros" de despesa
- `CHECK ((tipo = 'despesa' AND grupo IS NOT NULL) OR (tipo = 'receita' AND grupo IS NULL))`

Seed conforme tabela da §4 da spec de domínio.

## `parcelamentos`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `descricao` | `text` NOT NULL | sem o sufixo `n/N` |
| `valor_total_centavos` | `integer` NOT NULL | `CHECK > 0` |
| `num_parcelas` | `integer` NOT NULL | `CHECK BETWEEN 1 AND 120` |
| `primeira_data` | `date` NOT NULL | |
| `conta_id` | FK `contas` NOT NULL | |
| `categoria_id` | FK `categorias` NOT NULL | |
| `created_at` | `timestamptz` | |

## `lancamentos`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `data` | `date` NOT NULL | `mode: "string"` |
| `descricao` | `text` NOT NULL | |
| `valor_centavos` | `integer` NOT NULL | `CHECK > 0` — sempre positivo |
| `tipo` | `tipo_transacao` NOT NULL | |
| `categoria_id` | FK `categorias` NOT NULL | `ON DELETE RESTRICT` |
| `conta_id` | FK `contas` NOT NULL | `ON DELETE RESTRICT` |
| `forma_pagamento` | `forma_pagamento` NOT NULL | |
| `status` | `status_transacao` NOT NULL DEFAULT `pendente` | |
| `observacao` | `text` NULL | |
| `parcelamento_id` | FK `parcelamentos` NULL | `ON DELETE SET NULL` |
| `numero_parcela` | `integer` NULL | |
| `importacao_id` | FK `importacoes` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

Índices:

- `INDEX (data)` — todas as consultas do painel filtram por intervalo de mês
- `INDEX (categoria_id)`, `INDEX (conta_id)`
- `INDEX (parcelamento_id)`
- `CHECK ((parcelamento_id IS NULL) = (numero_parcela IS NULL))`

`ON DELETE RESTRICT` nas FKs é deliberado: categoria e conta se arquivam, não
se apagam. O banco impede o erro.

**Não existe** coluna `grupo` aqui — ver §4.1 da spec de domínio.

## `orcamentos_mensais`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `ano` | `integer` NOT NULL | |
| `mes` | `integer` NOT NULL | `CHECK BETWEEN 1 AND 12` |
| `renda_disponivel_centavos` | `integer` NOT NULL | |
| `meta_gastos_centavos` | `integer` NULL | |
| `pct_necessidade` | `integer` NOT NULL DEFAULT 50 | |
| `pct_desejo` | `integer` NOT NULL DEFAULT 30 | |
| `pct_poupanca` | `integer` NOT NULL DEFAULT 20 | |

- `UNIQUE (ano, mes)`
- `CHECK (pct_necessidade + pct_desejo + pct_poupanca = 100)`

Percentuais como inteiros, não decimais — 50, não 0.5. Evita float e a soma
`= 100` vira um `CHECK` trivial.

## `dividas` / `pagamentos_divida`

`dividas`: `id`, `pessoa` (text NOT NULL), `valor_total_centavos`
(`CHECK > 0`), `observacao`, `created_at`.

`pagamentos_divida`: `id`, `divida_id` (FK `ON DELETE CASCADE`), `data`
(`date`), `valor_centavos` (`CHECK > 0`), `created_at`.

Cascade aqui é correto: pagamento sem dívida não significa nada.

Saldo e status são derivados em query, nunca colunas.

## `importacoes`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `serial` PK | |
| `nome_arquivo` | `text` NOT NULL | |
| `executada_em` | `timestamptz` DEFAULT now() | |
| `total_criados` | `integer` NOT NULL | |
| `total_ignorados` | `integer` NOT NULL | |
| `relatorio` | `jsonb` NOT NULL | linhas com erro/aviso |

Permite desfazer: `DELETE FROM lancamentos WHERE importacao_id = ?`.

---

## Migrations

Geradas por `pnpm db:generate`, versionadas em `db/migrations`, nunca
editadas à mão depois de aplicadas. Seed de contas e categorias é script
separado e idempotente (`ON CONFLICT DO NOTHING`), não migration.
