# 001 — Importação da planilha

**Status:** Concluída — implementada e validada de ponta a ponta em 2026-09-07
**Tipo:** Spec-first (descartável após o merge)
**Depende de:** `specs/dominio-financeiro.md`, `specs/data-model.md`

---

## Problema

O sistema nasce vazio. Existem 35 lançamentos reais em
`FINANÇAS_ULTIMATE.xlsx` e um controle de dívidas com dois registros. Começar
de tela em branco significa redigitar tudo — e, na prática, significa não
começar.

Esta é a primeira feature de propósito: toca várias camadas (parsing,
domínio, banco, UI), tem regra de negócio real, e o resultado é verificável
contra números conhecidos.

## Solução

Um comando de linha que lê o `.xlsx`, converte para o modelo do sistema,
grava numa transação e emite relatório.

CLI, não upload web. É operação única de migração; UI para isso é trabalho
jogado fora.

```bash
pnpm import:xlsx ./FINANÇAS_ULTIMATE.xlsx            # dry-run (padrão)
pnpm import:xlsx ./FINANÇAS_ULTIMATE.xlsx --commit   # grava
```

---

## Formato de origem

Aba **`Lançamentos`**, cabeçalho na linha 5, dados a partir da linha 6:

| Coluna | Campo | Destino |
|---|---|---|
| B | Data | `lancamentos.data` |
| C | Conta | `contas.nome` (resolve) |
| D | Descrição | `lancamentos.descricao` |
| E | Categoria | `categorias.nome` (resolve) |
| F | Grupo (auto) | **ignorar** — derivado no sistema |
| G | Forma de Pagamento | `lancamentos.forma_pagamento` |
| H | Tipo | `lancamentos.tipo` |
| I | Valor | `lancamentos.valor_centavos` |
| J | Status | `lancamentos.status` |
| K, L, M | Mês, #E, #S | **ignorar** — auxiliares da planilha |

Aba **`Dívidas`**, cabeçalho na linha 5, dados nas linhas 6–15:
coluna B `pessoa`, C `valor_total`, D `já pago`. Colunas E–G são fórmulas e
devem ser ignoradas.

Abas `Painel`, `Visão do Mês`, `Resumo Anual`, `Categorias`: ignoradas
inteiramente.

### Armadilhas conhecidas neste arquivo

1. **Células de valor são fórmulas.** `C6` contém `=2299 - 150`, `C17`
   contém `= 300.95 / 2`. É obrigatório ler os **valores calculados**
   (cache), não as fórmulas. Em Python seria `data_only=True`; em Node, a
   biblioteca deve expor o valor calculado.

2. **Valores com terceira casa decimal.** `300.95 / 2 = 150.475`. A conversão
   para centavos precisa de regra explícita — ver R4.

3. **Datas podem estar como texto.** No arquivo original três linhas tinham
   `"21/09/2026"` como string. Já foram corrigidas, mas o importador não pode
   assumir isso.

4. **Linhas vazias com fórmula.** As linhas 41–988 têm fórmula nas colunas F,
   K, L, M e retornam `""`. Uma linha só é dado se **coluna B (data) e coluna
   I (valor)** estiverem preenchidas.

---

## Requisitos

### R1 — Ler apenas linhas com dado real

**DADO** a aba `Lançamentos`
**QUANDO** o importador percorre da linha 6 até a última
**ENTÃO** considera linha válida somente se B e I estiverem preenchidas
**E** para no fim sem depender de `max_row`, que reporta 988.

### R2 — Resolver valor calculado de fórmula

**DADO** uma célula de valor contendo `= 300.95 / 2`
**QUANDO** o importador lê a célula
**ENTÃO** obtém `150.475`, não a string da fórmula
**E** se o valor calculado não existir no arquivo, aborta com erro pedindo
que a planilha seja aberta e salva uma vez para gerar o cache.

### R3 — Aceitar data como data ou como texto

**DADO** uma célula de data
**QUANDO** o conteúdo é data nativa → usa direto
**QUANDO** o conteúdo é texto em `dd/MM/yyyy` → converte e **registra aviso**
**QUANDO** não é possível converter → registra erro, pula a linha, segue
**ENTÃO** o valor gravado é `YYYY-MM-DD`, sem hora.

Ambiguidade `dd/MM` vs `MM/dd` não existe: o formato é sempre brasileiro.
`03/04/2026` é 3 de abril.

### R4 — Converter para centavos sem passar por float

**DADO** um valor decimal vindo da planilha
**QUANDO** convertido para centavos
**ENTÃO** a terceira casa decimal `>= 5` arredonda para cima
**E** registra aviso quando houve arredondamento, com valor original e resultado.

⚠️ **`Math.round(valor * 100)` está proibido.** A multiplicação por 100 em
ponto flutuante produz resultado abaixo do real em vários valores comuns:

| Valor | `valor * 100` | `Math.round` | Correto |
|---|---|---|---|
| `1.005` | `100.49999999999999` | `100` ❌ | `101` |
| `8.165` | `816.4999999999999` | `816` ❌ | `817` |
| `150.475` | `15047.5` | `15048` ✅ | `15048` |

Ou seja: funciona para os 35 lançamentos deste arquivo e falha silenciosamente
no primeiro valor novo que cair na faixa ruim. Não é aceitável.

Implementação obrigatória — via representação decimal em string, ou usando
uma biblioteca decimal (`decimal.js`, `big.js`):

```ts
export function paraCentavos(valor: number): number {
  const s = valor.toFixed(10);                    // recupera a decimal pretendida
  const negativo = s.startsWith("-");
  const [inteiro, decimais = ""] = (negativo ? s.slice(1) : s).split(".");
  const centavos = Number(decimais.slice(0, 2).padEnd(2, "0"));
  const terceira = Number(decimais[2] ?? "0");
  const total = Number(inteiro) * 100 + centavos + (terceira >= 5 ? 1 : 0);
  return negativo ? -total : total;
}
```

Casos de teste obrigatórios: `1.005 → 101`, `8.165 → 817`, `2.675 → 268`,
`150.475 → 15048`, `0.005 → 1`, `188.93 → 18893`.

> Consequência conhecida: `Ju Mansan 3/5` (`150.475`) e `Ju Mansan 2/5`
> (`188.93`) vêm de divisões por 2 feitas na planilha. Depois da importação
> eles são lançamentos independentes, **não** um parcelamento. Converter
> esses grupos em `parcelamentos` fica fora desta feature (ver R10).

### R5 — Resolver contas e categorias por nome

**DADO** o nome vindo da planilha
**QUANDO** existe registro com esse nome → usa o id
**QUANDO** não existe → cria, e registra aviso
**ENTÃO** comparação é case-insensitive e ignora espaços nas pontas
**E** categoria criada automaticamente recebe `grupo` inferido do `tipo` da
linha: despesa → `desejo`, receita → `grupo = null`.

`desejo` como padrão é chute deliberado e conservador — aparece no relatório
para revisão manual.

### R6 — Mapear enums

| Planilha | Sistema |
|---|---|
| `Receita` / `Despesa` | `receita` / `despesa` |
| `Débito`, `Crédito`, `Pix`, `Dinheiro`, `Boleto` | `debito`, `credito`, `pix`, `dinheiro`, `boleto` |
| `Pago` / `Pendente` | `pago` / `pendente` |

Comparação sem acento e sem caixa. Valor não reconhecido → erro na linha,
linha pulada.

### R7 — Coerência entre tipo e categoria

**DADO** uma linha `tipo = Despesa` com categoria cujo `tipo` é `receita`
**ENTÃO** registra erro, pula a linha
**E** não "conserta" nada automaticamente.

### R8 — Dry-run por padrão

**DADO** execução sem `--commit`
**QUANDO** o importador termina
**ENTÃO** nada foi gravado
**E** o relatório impresso é idêntico ao que seria com `--commit`.

### R9 — Atomicidade e rastreabilidade

**DADO** execução com `--commit`
**QUANDO** grava
**ENTÃO** tudo acontece numa transação única
**E** cria um registro em `importacoes` com o relatório em `jsonb`
**E** todo lançamento criado recebe `importacao_id`
**E** se qualquer erro fatal ocorrer, faz rollback completo.

Desfazer é `DELETE FROM lancamentos WHERE importacao_id = ?`.

### R10 — Não inferir parcelamento

**DADO** descrições como `Empréstimo 1/3`, `Ju Mansan 3/5`, `Berzerk 2/2`
**QUANDO** o importador processa
**ENTÃO** cria lançamentos independentes, preservando a descrição literal
**E** não cria registro em `parcelamentos`
**E** não preenche `parcelamento_id` nem `numero_parcela`.

Inferir plano a partir de texto é adivinhação: `Empréstimo 1/3` aparece
quatro vezes no arquivo com valores diferentes, ou seja, são planos
distintos com o mesmo nome. Agrupar erraria. Reconstruir parcelamentos é
trabalho manual posterior, se o usuário quiser.

### R11 — Importar dívidas

**DADO** a aba `Dívidas`, linhas 6–15
**QUANDO** a coluna B tem nome
**ENTÃO** cria `dividas` com `pessoa` e `valor_total_centavos`
**E** se `já pago` > 0, cria um `pagamentos_divida` com esse valor e data do
dia da importação
**E** ignora as colunas de fórmula (saldo, %, status).

### R12 — Relatório final

Ao terminar, imprime:

```
Importação: FINANÇAS_ULTIMATE.xlsx   [DRY-RUN | COMMIT]

Lançamentos
  criados .................. 35
  ignorados (linha vazia) ... 0
  com erro .................. 0

Receitas ..... R$ 2.149,00
Despesas ..... R$ 3.095,98
Saldo ........ -R$ 946,98

Dívidas: 2 criadas, total R$ 6.951,99

Avisos (3)
  linha 40  data em texto "27/09/2026" convertida
  linha  7  valor 150.475 arredondado para R$ 150,48
  linha 12  categoria "Tarifas/Taxas" criada com grupo "desejo" — revisar

Erros (0)
```

---

## Critérios de conclusão

- [x] `pnpm import:xlsx <arquivo>` roda em dry-run sem tocar o banco
- [x] 35 lançamentos importados do arquivo de referência
- [x] Total de despesas de setembro/2026 = **R$ 3.095,98** — não R$ 3.095,96,
      que é o total que a planilha exibe somando os floats crus e
      arredondando só no fim; a R4 manda arredondar cada lançamento antes de
      gravar, e 5 lançamentos deste arquivo (`150.475`, `51.875`, `196.665`,
      `39.905`, `27.975`, todos com terceira casa `5`) arredondam para cima
      individualmente, batendo 2 centavos a mais que o agregado
- [x] Total de receitas de setembro/2026 = **R$ 2.149,00**
- [x] 2 dívidas importadas, total R$ 6.951,99
- [x] Rodar duas vezes com `--commit` cria duas `importacoes` distintas
      (dedupe **não** é requisito — desfazer é o mecanismo)
- [x] Linha com data inválida não derruba a execução
- [x] Teste com planilha sintética cobrindo: fórmula, data em texto, valor
      com 3 casas, linha vazia, enum inválido, tipo incoerente

Todos os critérios acima foram validados manualmente contra um Postgres
descartável (Docker) e o arquivo real `FINANÇAS_ULTIMATE_v3.xlsx` em
2026-09-07 — incluindo o caminho de rollback (erro fatal forçado via
violação de `CHECK`, confirmado que desfaz conta/categoria/lançamentos
órfãos). Ver `lib/importacao*.test.ts` para a cobertura automatizada.

## Fora de escopo

- Upload pela web
- Deduplicação entre importações
- Reconstrução de parcelamentos (R10)
- Importar as abas `Painel`, `Resumo Anual`, `Visão do Mês`
- Criar `orcamentos_mensais` a partir do bloco 50/30/20 da planilha —
  o usuário informa na primeira vez que abrir o painel
