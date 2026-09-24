# CLAUDE.md — Constitution

Sistema de controle financeiro pessoal. Usuário único (Henrique). Substitui uma
planilha Excel que já está em produção há meses — a planilha é a especificação
de origem, e o comportamento dela é a referência de corretude.

## Stack

| Camada | Escolha | Observação |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components + Server Actions |
| UI | Mantine | `NumberInput`, `@mantine/dates`, `@mantine/form`, `@mantine/charts` |
| Banco | Postgres (Railway) | |
| ORM | Drizzle | migrations versionadas em `db/migrations` |
| Validação | Zod | schema compartilhado entre form e Server Action |
| Datas | dayjs, locale `pt-BR` | |

## Invariantes — não violar, nunca

1. **Dinheiro é `integer` em centavos.** Nunca `float`, `number` decimal,
   `double precision` ou `money`. O nome do campo sempre termina em
   `_centavos`. Formatação só na borda de exibição.

2. **Data de domínio não tem hora nem timezone.** Coluna Postgres `date`,
   em TypeScript `string` no formato `YYYY-MM-DD`. É proibido usar `new Date()`
   para representar data de lançamento — ele arrasta timezone e desloca o dia.
   `timestamp` só para `created_at` / `updated_at`.

3. **Toda entrada de data é validada como data.** A planilha atual perdeu
   R$ 406,28 de cálculos porque três datas foram gravadas como texto. Parsing
   frouxo é bug, não conveniência.

4. **Soma de parcelas é igual ao total.** Qualquer divisão de valor distribui
   o resto em centavos. Ver `specs/dominio-financeiro.md`.

5. **Nada de SQL cru fora de `db/migrations`.** Query é Drizzle.

6. **Sem `<form>` HTML nativo com submit do browser.** Server Actions.

## Convenções

- Nomes de tabela, coluna e enum em **português**, snake_case. Código em
  TypeScript segue camelCase; o mapeamento fica no schema Drizzle.
- Toda Server Action valida a entrada com Zod antes de tocar o banco.
- Erros de validação do servidor voltam para o formulário por campo.
- Componente de UI não faz query. Dado desce por props a partir de Server
  Component ou Server Action.
- Sem barrel files (`index.ts` reexportando tudo).

## Comandos

```bash
pnpm dev                 # servidor de desenvolvimento
pnpm build               # build de produção
pnpm typecheck           # tsc --noEmit
pnpm lint
pnpm test                # vitest
pnpm db:generate         # gera migration a partir do schema
pnpm db:migrate          # aplica migrations
pnpm db:studio           # drizzle studio
```

Antes de considerar uma tarefa concluída: `pnpm typecheck && pnpm test`.

## Autenticação

Usuário único. Sessão por cookie assinado, senha em variável de ambiente.
Não existe tabela de usuários no v1 e **não** se deve inventar uma.
As tabelas não têm `usuario_id`; caso vire multiusuário, isso entra por
migration própria.

Toda Server Action, exceto `entrar`, começa com `await exigirSessao()`
(`lib/sessao-servidor.ts`) — o proxy não protege IDs de Server Action.

## Specs

- `specs/dominio-financeiro.md` — regras de negócio. **Spec-anchored**: vive
  junto com o código, é atualizada quando a regra muda, nunca deletada.
- `specs/data-model.md` — entidades e schema.
- `specs/NNN-*.md` — specs de feature. Descartáveis depois do merge.

Quando o código contradisser a spec de domínio, **pare e pergunte**. Não
contorne silenciosamente: ou o código está errado, ou a spec precisa mudar
— e nos dois casos a decisão é do humano.

## Quando usar o loop de spec

Use spec para: regra de dinheiro, geração de parcelas, cálculo de orçamento,
importação, qualquer mudança que toque 4+ arquivos.

**Não** use para: tela de CRUD, ajuste de estilo, renomear campo, corrigir
typo. Nesses casos vá direto ao código.

## Escopo v1

Dentro: CRUD de lançamentos, visão mensal, painel (KPIs, por categoria, por
conta, 50/30/20), categorias e contas, parcelamentos, dívidas pessoais,
importação da planilha.

Fora (não construir, não deixar gancho especulativo): Open Finance /
integração bancária, multimoeda, multiusuário, app nativo, relatórios
configuráveis, fatura de cartão com fechamento e vencimento, recorrências
automáticas.
