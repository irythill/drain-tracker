CREATE TYPE "public"."forma_pagamento" AS ENUM('debito', 'credito', 'pix', 'dinheiro', 'boleto');--> statement-breakpoint
CREATE TYPE "public"."grupo_orcamento" AS ENUM('necessidade', 'desejo', 'poupanca_divida');--> statement-breakpoint
CREATE TYPE "public"."status_transacao" AS ENUM('pago', 'pendente');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta" AS ENUM('conta', 'cartao');--> statement-breakpoint
CREATE TYPE "public"."tipo_transacao" AS ENUM('receita', 'despesa');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_transacao" NOT NULL,
	"grupo" "grupo_orcamento",
	"arquivada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_nome_tipo_uq" UNIQUE("nome","tipo"),
	CONSTRAINT "categorias_grupo_coerente" CHECK (("categorias"."tipo" = 'despesa' AND "categorias"."grupo" IS NOT NULL)
          OR ("categorias"."tipo" = 'receita' AND "categorias"."grupo" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_conta" NOT NULL,
	"dia_fechamento" integer,
	"dia_vencimento" integer,
	"arquivada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "dividas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pessoa" text NOT NULL,
	"valor_total_centavos" integer NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dividas_valor_positivo" CHECK ("dividas"."valor_total_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome_arquivo" text NOT NULL,
	"executada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"total_criados" integer NOT NULL,
	"total_ignorados" integer NOT NULL,
	"relatorio" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"tipo" "tipo_transacao" NOT NULL,
	"categoria_id" integer NOT NULL,
	"conta_id" integer NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"status" "status_transacao" DEFAULT 'pendente' NOT NULL,
	"observacao" text,
	"parcelamento_id" integer,
	"numero_parcela" integer,
	"importacao_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_valor_positivo" CHECK ("lancamentos"."valor_centavos" > 0),
	CONSTRAINT "lancamentos_parcela_coerente" CHECK (("lancamentos"."parcelamento_id" IS NULL) = ("lancamentos"."numero_parcela" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "orcamentos_mensais" (
	"id" serial PRIMARY KEY NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"renda_disponivel_centavos" integer NOT NULL,
	"meta_gastos_centavos" integer,
	"pct_necessidade" integer DEFAULT 50 NOT NULL,
	"pct_desejo" integer DEFAULT 30 NOT NULL,
	"pct_poupanca" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orcamentos_ano_mes_uq" UNIQUE("ano","mes"),
	CONSTRAINT "orcamentos_mes_faixa" CHECK ("orcamentos_mensais"."mes" BETWEEN 1 AND 12),
	CONSTRAINT "orcamentos_pct_soma_100" CHECK ("orcamentos_mensais"."pct_necessidade" + "orcamentos_mensais"."pct_desejo" + "orcamentos_mensais"."pct_poupanca" = 100)
);
--> statement-breakpoint
CREATE TABLE "pagamentos_divida" (
	"id" serial PRIMARY KEY NOT NULL,
	"divida_id" integer NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagamentos_divida_valor_positivo" CHECK ("pagamentos_divida"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "parcelamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"valor_total_centavos" integer NOT NULL,
	"num_parcelas" integer NOT NULL,
	"primeira_data" date NOT NULL,
	"conta_id" integer NOT NULL,
	"categoria_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parcelamentos_valor_positivo" CHECK ("parcelamentos"."valor_total_centavos" > 0),
	CONSTRAINT "parcelamentos_num_parcelas_faixa" CHECK ("parcelamentos"."num_parcelas" BETWEEN 1 AND 120)
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_parcelamento_id_parcelamentos_id_fk" FOREIGN KEY ("parcelamento_id") REFERENCES "public"."parcelamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_divida" ADD CONSTRAINT "pagamentos_divida_divida_id_dividas_id_fk" FOREIGN KEY ("divida_id") REFERENCES "public"."dividas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelamentos" ADD CONSTRAINT "parcelamentos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelamentos" ADD CONSTRAINT "parcelamentos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_data_idx" ON "lancamentos" USING btree ("data");--> statement-breakpoint
CREATE INDEX "lancamentos_categoria_idx" ON "lancamentos" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "lancamentos_conta_idx" ON "lancamentos" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "lancamentos_parcelamento_idx" ON "lancamentos" USING btree ("parcelamento_id");--> statement-breakpoint
CREATE INDEX "pagamentos_divida_divida_idx" ON "pagamentos_divida" USING btree ("divida_id");