import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const tipoConta = pgEnum("tipo_conta", ["conta", "cartao"]);

export const tipoTransacao = pgEnum("tipo_transacao", ["receita", "despesa"]);

export const grupoOrcamento = pgEnum("grupo_orcamento", [
  "necessidade",
  "desejo",
  "poupanca_divida",
]);

export const formaPagamento = pgEnum("forma_pagamento", [
  "debito",
  "credito",
  "pix",
  "dinheiro",
  "boleto",
]);

export const statusTransacao = pgEnum("status_transacao", ["pago", "pendente"]);

/* -------------------------------------------------------------------------- */
/* contas                                                                     */
/* -------------------------------------------------------------------------- */

export const contas = pgTable("contas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  tipo: tipoConta("tipo").notNull(),
  /** Reservado para modelagem de fatura. Não usar no v1. */
  diaFechamento: integer("dia_fechamento"),
  /** Reservado para modelagem de fatura. Não usar no v1. */
  diaVencimento: integer("dia_vencimento"),
  arquivada: boolean("arquivada").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* categorias                                                                 */
/* -------------------------------------------------------------------------- */

export const categorias = pgTable(
  "categorias",
  {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    tipo: tipoTransacao("tipo").notNull(),
    /** NOT NULL quando tipo = 'despesa'; NULL quando tipo = 'receita'. */
    grupo: grupoOrcamento("grupo"),
    arquivada: boolean("arquivada").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("categorias_nome_tipo_uq").on(t.nome, t.tipo),
    check(
      "categorias_grupo_coerente",
      sql`(${t.tipo} = 'despesa' AND ${t.grupo} IS NOT NULL)
          OR (${t.tipo} = 'receita' AND ${t.grupo} IS NULL)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* parcelamentos                                                              */
/* -------------------------------------------------------------------------- */

export const parcelamentos = pgTable(
  "parcelamentos",
  {
    id: serial("id").primaryKey(),
    /** Sem o sufixo "n/N" — ele é montado na descrição de cada parcela. */
    descricao: text("descricao").notNull(),
    valorTotalCentavos: integer("valor_total_centavos").notNull(),
    numParcelas: integer("num_parcelas").notNull(),
    primeiraData: date("primeira_data", { mode: "string" }).notNull(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "restrict" }),
    categoriaId: integer("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("parcelamentos_valor_positivo", sql`${t.valorTotalCentavos} > 0`),
    check(
      "parcelamentos_num_parcelas_faixa",
      sql`${t.numParcelas} BETWEEN 1 AND 120`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* importacoes                                                                */
/* -------------------------------------------------------------------------- */

export const importacoes = pgTable("importacoes", {
  id: serial("id").primaryKey(),
  nomeArquivo: text("nome_arquivo").notNull(),
  executadaEm: timestamp("executada_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  totalCriados: integer("total_criados").notNull(),
  totalIgnorados: integer("total_ignorados").notNull(),
  relatorio: jsonb("relatorio").notNull(),
});

/* -------------------------------------------------------------------------- */
/* lancamentos                                                                */
/* -------------------------------------------------------------------------- */

export const lancamentos = pgTable(
  "lancamentos",
  {
    id: serial("id").primaryKey(),
    /** Dia civil, sem hora e sem timezone. Sempre "YYYY-MM-DD". */
    data: date("data", { mode: "string" }).notNull(),
    descricao: text("descricao").notNull(),
    /** Sempre positivo. O sinal vem de `tipo`. */
    valorCentavos: integer("valor_centavos").notNull(),
    tipo: tipoTransacao("tipo").notNull(),
    categoriaId: integer("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "restrict" }),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "restrict" }),
    formaPagamento: formaPagamento("forma_pagamento").notNull(),
    status: statusTransacao("status").notNull().default("pendente"),
    observacao: text("observacao"),
    parcelamentoId: integer("parcelamento_id").references(
      () => parcelamentos.id,
      { onDelete: "set null" },
    ),
    numeroParcela: integer("numero_parcela"),
    importacaoId: integer("importacao_id").references(() => importacoes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lancamentos_data_idx").on(t.data),
    index("lancamentos_categoria_idx").on(t.categoriaId),
    index("lancamentos_conta_idx").on(t.contaId),
    index("lancamentos_parcelamento_idx").on(t.parcelamentoId),
    check("lancamentos_valor_positivo", sql`${t.valorCentavos} > 0`),
    check(
      "lancamentos_parcela_coerente",
      sql`(${t.parcelamentoId} IS NULL) = (${t.numeroParcela} IS NULL)`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* orcamentos_mensais                                                         */
/* -------------------------------------------------------------------------- */

export const orcamentosMensais = pgTable(
  "orcamentos_mensais",
  {
    id: serial("id").primaryKey(),
    ano: integer("ano").notNull(),
    mes: integer("mes").notNull(),
    rendaDisponivelCentavos: integer("renda_disponivel_centavos").notNull(),
    metaGastosCentavos: integer("meta_gastos_centavos"),
    /** Percentuais como inteiros (50, não 0.5). Devem somar 100. */
    pctNecessidade: integer("pct_necessidade").notNull().default(50),
    pctDesejo: integer("pct_desejo").notNull().default(30),
    pctPoupanca: integer("pct_poupanca").notNull().default(20),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("orcamentos_ano_mes_uq").on(t.ano, t.mes),
    check("orcamentos_mes_faixa", sql`${t.mes} BETWEEN 1 AND 12`),
    check(
      "orcamentos_pct_soma_100",
      sql`${t.pctNecessidade} + ${t.pctDesejo} + ${t.pctPoupanca} = 100`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* dividas / pagamentos_divida                                                */
/* -------------------------------------------------------------------------- */

export const dividas = pgTable(
  "dividas",
  {
    id: serial("id").primaryKey(),
    pessoa: text("pessoa").notNull(),
    valorTotalCentavos: integer("valor_total_centavos").notNull(),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("dividas_valor_positivo", sql`${t.valorTotalCentavos} > 0`)],
);

export const pagamentosDivida = pgTable(
  "pagamentos_divida",
  {
    id: serial("id").primaryKey(),
    dividaId: integer("divida_id")
      .notNull()
      .references(() => dividas.id, { onDelete: "cascade" }),
    data: date("data", { mode: "string" }).notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pagamentos_divida_divida_idx").on(t.dividaId),
    check("pagamentos_divida_valor_positivo", sql`${t.valorCentavos} > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const contasRelations = relations(contas, ({ many }) => ({
  lancamentos: many(lancamentos),
  parcelamentos: many(parcelamentos),
}));

export const categoriasRelations = relations(categorias, ({ many }) => ({
  lancamentos: many(lancamentos),
  parcelamentos: many(parcelamentos),
}));

export const parcelamentosRelations = relations(
  parcelamentos,
  ({ one, many }) => ({
    conta: one(contas, {
      fields: [parcelamentos.contaId],
      references: [contas.id],
    }),
    categoria: one(categorias, {
      fields: [parcelamentos.categoriaId],
      references: [categorias.id],
    }),
    parcelas: many(lancamentos),
  }),
);

export const lancamentosRelations = relations(lancamentos, ({ one }) => ({
  categoria: one(categorias, {
    fields: [lancamentos.categoriaId],
    references: [categorias.id],
  }),
  conta: one(contas, {
    fields: [lancamentos.contaId],
    references: [contas.id],
  }),
  parcelamento: one(parcelamentos, {
    fields: [lancamentos.parcelamentoId],
    references: [parcelamentos.id],
  }),
  importacao: one(importacoes, {
    fields: [lancamentos.importacaoId],
    references: [importacoes.id],
  }),
}));

export const dividasRelations = relations(dividas, ({ many }) => ({
  pagamentos: many(pagamentosDivida),
}));

export const pagamentosDividaRelations = relations(
  pagamentosDivida,
  ({ one }) => ({
    divida: one(dividas, {
      fields: [pagamentosDivida.dividaId],
      references: [dividas.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/* Tipos inferidos                                                            */
/* -------------------------------------------------------------------------- */

export type Conta = typeof contas.$inferSelect;
export type NovaConta = typeof contas.$inferInsert;
export type Categoria = typeof categorias.$inferSelect;
export type NovaCategoria = typeof categorias.$inferInsert;
export type Lancamento = typeof lancamentos.$inferSelect;
export type NovoLancamento = typeof lancamentos.$inferInsert;
export type Parcelamento = typeof parcelamentos.$inferSelect;
export type NovoParcelamento = typeof parcelamentos.$inferInsert;
export type OrcamentoMensal = typeof orcamentosMensais.$inferSelect;
export type NovoOrcamentoMensal = typeof orcamentosMensais.$inferInsert;
export type Divida = typeof dividas.$inferSelect;
export type PagamentoDivida = typeof pagamentosDivida.$inferSelect;
