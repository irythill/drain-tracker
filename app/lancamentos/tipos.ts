import type { Categoria, Conta, Lancamento } from "@/db/schema";

export type LancamentoComRelacoes = Lancamento & {
  categoria: Categoria;
  conta: Conta;
};
