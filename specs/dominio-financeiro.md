# Domínio Financeiro — Spec

**Status:** Ativa
**Tipo:** Spec-anchored — mantida junto com o código pela vida do projeto
**Origem:** planilha `FINANÇAS_ULTIMATE.xlsx` (abas Painel, Lançamentos,
Resumo Anual, Dívidas, Categorias)

Este documento define as regras de negócio. Se o código divergir daqui, uma
das duas partes está errada e a decisão é humana.

---

## 1. Dinheiro

### 1.1 Representação

Todo valor monetário é `integer` em **centavos de BRL**. `R$ 150,48` é
`15048`. Campos terminam em `_centavos`.

Motivo: a planilha de origem tem valores como `300.95 / 2 = 150.475`. Em
ponto flutuante isso acumula erro e uma hora o total do mês não fecha por um
centavo.

Teto do `integer`: R$ 21.474.836,47. Suficiente; não usar `bigint`.

### 1.2 Conversão decimal → centavos

**`Math.round(valor * 100)` é proibido.** Em ponto flutuante,
`1.005 * 100 = 100.49999999999999` e `8.165 * 100 = 816.4999999999999`, o que
faz o arredondamento cair para baixo silenciosamente.

Converter sempre pela representação decimal em string (ou por biblioteca
decimal). Implementação de referência em `lib/dinheiro.ts`:

```ts
export function paraCentavos(valor: number): number {
  const s = valor.toFixed(10);
  const negativo = s.startsWith("-");
  const [inteiro, decimais = ""] = (negativo ? s.slice(1) : s).split(".");
  const centavos = Number(decimais.slice(0, 2).padEnd(2, "0"));
  const terceira = Number(decimais[2] ?? "0");
  const total = Number(inteiro) * 100 + centavos + (terceira >= 5 ? 1 : 0);
  return negativo ? -total : total;
}
```

Esta função é o **único** ponto do sistema onde decimal vira centavos. Entrada
de usuário via Mantine `NumberInput` também passa por ela.

### 1.3 Formatação

Só na borda de exibição:

```ts
new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
  .format(centavos / 100)
```

Nunca persistir, comparar ou somar a string formatada.

### 1.4 Divisão de valores — regra do resto

Ao dividir um total em N partes:

```
base  = Math.floor(total / n)
resto = total - base * n            // 0 <= resto < n
```

As **primeiras `resto` partes** recebem `base + 1`; as demais recebem `base`.
A soma das partes é sempre exatamente igual ao total.

Exemplo: `30095` centavos em 2 partes → `base = 15047`, `resto = 1` →
`[15048, 15047]`. Soma `30095`. ✅

Esta regra vale para parcelamento e para qualquer rateio futuro. É a única
forma permitida de dividir dinheiro.

---

## 2. Datas

Data de domínio (data do lançamento, primeira parcela, pagamento de dívida) é
**dia civil, sem hora e sem timezone**.

- Postgres: `date`
- Drizzle: `date({ mode: "string" })` → `string` `YYYY-MM-DD`
- TypeScript: **nunca** `Date` para data de domínio

`created_at` e `updated_at` são `timestamptz` e não têm relação com isso.

### 2.1 Aritmética de mês

Somar meses satura no último dia do mês de destino:

- `2026-01-31` + 1 mês → `2026-02-28` (ou `-29` em bissexto)
- `2026-01-31` + 3 meses → `2026-04-30`

Somar 1 mês doze vezes **não** é o mesmo que somar 12 meses. A parcela `n` é
sempre calculada a partir da data da **primeira** parcela, nunca da anterior:

```
data(n) = adicionaMeses(primeira_data, n - 1)
```

Isso evita deriva acumulada.

---

## 3. Contas

Uma conta representa origem ou meio de pagamento: `Nubank`, `PicPay`, `Inter`,
`Itaú`, `Renner`, `Shopee`, `Dinheiro`.

Campo `tipo`: `conta` ou `cartao`. No v1 o tipo é apenas informativo — não
muda cálculo nenhum. `dia_fechamento` e `dia_vencimento` existem no schema
mas ficam nulos e **não são usados** no v1 (ver §7).

Conta não é deletada; é **arquivada** (`arquivada = true`). Lançamento
histórico precisa continuar apontando para ela.

---

## 4. Categorias e grupos

Categoria tem `tipo` (`receita` | `despesa`) e, quando `despesa`, um `grupo`:

| Grupo | Meta padrão | Categorias iniciais |
|---|---|---|
| `necessidade` | 50% | Alimentação, Transporte, Moradia, Saúde, Educação, Tarifas/Taxas |
| `desejo` | 30% | Assinaturas, Lazer, Compras, Outros |
| `poupanca_divida` | 20% | Dívidas/Parcelamentos, Empréstimos, Investimentos, Reserva de Emergência |

Categorias de receita: Salário, Bonificação, Extra, Freelance, Outros.

Categoria de receita tem `grupo = null`.

### 4.1 Grupo é derivado, não copiado

O grupo de um lançamento é obtido por join com a categoria **no momento da
consulta**. Não existe coluna `grupo` em `lancamentos`.

Consequência aceita: recategorizar "Compras" de `desejo` para `necessidade`
reescreve o passado nos relatórios.

Isso é decisão deliberada, não descuido. Se um dia a fidelidade histórica for
necessária, a mudança é adicionar `grupo_snapshot` em `lancamentos`, populado
na criação — e esta seção deve ser atualizada junto.

Categoria também é arquivada, nunca deletada.

---

## 5. Lançamentos

Unidade central. Campos: `data`, `descricao`, `valor_centavos` (sempre
positivo), `tipo` (`receita` | `despesa`), `categoria_id`, `conta_id`,
`forma_pagamento`, `status`, `observacao`, `parcelamento_id`,
`numero_parcela`.

### 5.1 Sinal

`valor_centavos` é **sempre positivo**. O que determina soma ou subtração é
`tipo`. Não existe valor negativo em lançamento.

### 5.2 Coerência de tipo

`tipo` do lançamento deve bater com `tipo` da categoria. Um lançamento
`despesa` com categoria de receita é inválido e a Server Action rejeita.

### 5.3 Status — competência, não caixa

`status` é `pago` ou `pendente`.

**No v1, `status` não afeta nenhum cálculo agregado.** Um lançamento entra no
mês pela sua `data`, pago ou não. É o comportamento da planilha atual e é
regime de **competência**.

O que `status` faz:

- Alimenta dois KPIs informativos: `Já pago` e `A pagar` no mês
- Muda a cor na listagem

Um lançamento em `pendente` cuja data já passou é exibido com destaque
("atrasado"), mas isso é apresentação — nenhuma soma muda.

> **Decisão em aberto, registrada de propósito:** com cartão de crédito,
> competência e caixa divergem — compra de setembro sai da conta em outubro.
> Tratar isso exige modelar fatura (fechamento, vencimento, vinculação de
> lançamento à fatura). Fica fora do v1. Quando entrar, esta seção muda.

---

## 6. Parcelamentos

Resolve o maior incômodo da planilha: hoje "Empréstimo 1/3", "2/3" e "3/3"
são digitados um a um, todo mês.

### 6.1 Modelo

Um `parcelamento` guarda a **intenção**: descrição, valor total, número de
parcelas, data da primeira, conta, categoria.

As parcelas são **lançamentos reais** no banco, com `parcelamento_id` e
`numero_parcela` preenchidos. Não são calculadas em tempo de consulta.

Motivo: parcela precisa poder ser editada individualmente (mudou de valor,
foi antecipada, caiu em outra conta) sem quebrar o plano.

### 6.2 Geração

Ao criar um parcelamento com total `T` e `N` parcelas:

1. Divide `T` em `N` partes pela regra do resto (§1.4)
2. Para cada `n` de 1 a `N`, cria um lançamento com:
   - `data = adicionaMeses(primeira_data, n - 1)` (§2.1)
   - `valor_centavos` = a n-ésima parte
   - `descricao = "{descricao} {n}/{N}"`
   - `tipo = "despesa"`, `status = "pendente"`
   - `numero_parcela = n`

**Invariante:** `SUM(valor_centavos)` das parcelas geradas `= valor_total_centavos`.
Deve haver teste para isso.

### 6.3 Edição

Editar o plano regenera **apenas as parcelas ainda `pendente` com data futura**.
Parcelas com `status = pago` nunca são tocadas por regeneração.

Se a regeneração fizer a soma divergir do total (porque parcelas pagas já
consumiram parte), o sistema mostra a diferença e pede confirmação. Não
ajusta silenciosamente.

### 6.4 Exclusão

Excluir um parcelamento apaga as parcelas `pendente` e mantém as `pago`,
desvinculando-as (`parcelamento_id = null`). Histórico não some.

---

## 7. Orçamento mensal e regra 50/30/20

### 7.1 Por que existe uma tabela de orçamento

Na planilha, a "renda disponível" do bloco 50/30/20 estava fixa em R$ 3.282,
enquanto as receitas lançadas somavam R$ 2.149. As duas visões discordavam em
silêncio, porque a bonificação de R$ 1.000 não era lançada.

O sistema **não** repete isso. Existe `orcamentos_mensais` com um registro por
(ano, mês):

- `renda_disponivel_centavos` — base do 50/30/20, informada pelo usuário
- `meta_gastos_centavos` — teto de gasto do mês
- `pct_necessidade`, `pct_desejo`, `pct_poupanca` — inteiros somando 100

Ausente o registro do mês, o sistema usa o mês anterior mais recente como
padrão sugerido, mas **não grava** sozinho.

### 7.2 Divergência é exibida, não escondida

Quando `renda_disponivel_centavos` diverge do total de receitas lançadas no
mês em mais de 1%, o painel mostra um aviso com os dois números e a
diferença. Sem correção automática, sem esconder.

### 7.3 Cálculo

Para o mês (`ano`, `mes`):

```
receitas       = Σ valor_centavos onde tipo = receita   e data no mês
despesas       = Σ valor_centavos onde tipo = despesa   e data no mês
saldo          = receitas - despesas
taxa_poupanca  = receitas = 0 ? 0 : saldo / receitas

meta(grupo)    = round(renda_disponivel_centavos * pct(grupo) / 100)
real(grupo)    = Σ valor_centavos onde tipo = despesa
                   e categoria.grupo = grupo e data no mês
diferenca      = meta - real
```

`meta` usa arredondamento comum; a soma das três metas pode divergir da renda
em até 2 centavos e isso é aceito.

`taxa_poupanca` pode ser negativa — mês com saldo negativo é informação
legítima, não erro. Exibir em vermelho, não zerar.

---

## 8. Dívidas pessoais

Separadas de lançamentos. São valores devidos a pessoas (`MÃE`, `MATEUS`),
pagos aos poucos.

- `dividas`: `pessoa`, `valor_total_centavos`, `observacao`
- `pagamentos_divida`: `divida_id`, `data`, `valor_centavos`

`valor_pago` é **derivado** (`SUM` dos pagamentos), não é coluna. Saldo é
`valor_total - valor_pago`. Status é derivado: `saldo <= 0` → `quitado`.

Pagamento de dívida **não** cria lançamento automaticamente no v1. São
controles independentes. Se o usuário quiser refletir a saída de dinheiro,
lança manualmente.

---

## 9. Fora de escopo (v1)

Não implementar, e não deixar abstração especulativa preparada para:

- Fatura de cartão: fechamento, vencimento, vinculação lançamento→fatura
- Recorrências automáticas (Google One, assinatura Claude)
- Regime de caixa / conciliação bancária
- Open Finance, importação de OFX/extrato bancário
- Multiusuário, multimoeda
- Metas por categoria (só por grupo)
- Orçamento anual

---

## 10. Casos de teste obrigatórios

| # | Caso | Esperado |
|---|---|---|
| 0 | `paraCentavos(1.005)` | `101` (não `100`) |
| 0b | `paraCentavos(8.165)` | `817` (não `816`) |
| 1 | Dividir `30095` em 2 | `[15048, 15047]`, soma `30095` |
| 2 | Dividir `10000` em 3 | `[3334, 3333, 3333]`, soma `10000` |
| 3 | Dividir `1` em 3 | `[1, 0, 0]`, soma `1` |
| 4 | `adicionaMeses("2026-01-31", 1)` | `"2026-02-28"` |
| 5 | `adicionaMeses("2026-01-31", 3)` | `"2026-04-30"` |
| 6 | Parcelamento 36x de `558000` | 36 lançamentos, soma `558000`, última em `primeira + 35 meses` |
| 7 | Lançamento `despesa` com categoria de receita | rejeitado |
| 8 | Regenerar plano com parcela 1 `pago` | parcela 1 intacta |
| 9 | Mês sem receita | `taxa_poupanca = 0`, sem divisão por zero |
| 10 | Mês sem `orcamentos_mensais` | painel renderiza, sugere valor do mês anterior |
