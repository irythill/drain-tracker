import { z } from "zod";
import { ehDataISO } from "@/lib/data";

export const TIPOS_LANCAMENTO = ["receita", "despesa"] as const;
export const FORMAS_PAGAMENTO = ["debito", "credito", "pix", "dinheiro", "boleto"] as const;
export const STATUS_LANCAMENTO = ["pago", "pendente"] as const;

export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];
export type StatusLancamento = (typeof STATUS_LANCAMENTO)[number];

/** Teto do `integer` do Postgres. Acima disso a coluna estoura em erro 500. */
export const POSTGRES_INT_MAX = 2_147_483_647;

/** Schema compartilhado entre o form (client) e a Server Action. */
export const lancamentoSchema = z.object({
  data: z.string().refine(ehDataISO, "Data inválida"),
  descricao: z.string().trim().min(1, "Informe a descrição"),
  valorCentavos: z
    .number()
    .int("Valor deve ser inteiro em centavos")
    .positive("Valor deve ser maior que zero")
    .max(POSTGRES_INT_MAX, "Valor muito alto"),
  tipo: z.enum(TIPOS_LANCAMENTO),
  categoriaId: z
    .number()
    .int()
    .positive("Selecione uma categoria")
    .max(POSTGRES_INT_MAX, "Categoria inválida"),
  contaId: z
    .number()
    .int()
    .positive("Selecione uma conta")
    .max(POSTGRES_INT_MAX, "Conta inválida"),
  formaPagamento: z.enum(FORMAS_PAGAMENTO),
  status: z.enum(STATUS_LANCAMENTO),
  observacao: z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor)),
});

export type LancamentoInput = z.infer<typeof lancamentoSchema>;

/** Id de lançamento recebido por Server Actions de edição/exclusão. */
export const idLancamentoSchema = z.number().int().positive().max(POSTGRES_INT_MAX);
