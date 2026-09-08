import "dotenv/config";
import { db } from "@/db/client";
import { categorias, contas } from "@/db/schema";
import type { NovaCategoria, NovaConta } from "@/db/schema";

/**
 * Seed de contas e categorias. Idempotente — pode rodar quantas vezes quiser.
 * Não é migration de propósito: é dado inicial, não estrutura.
 * Ver `specs/dominio-financeiro.md` §3 e §4.
 */

const CONTAS: NovaConta[] = [
  { nome: "Nubank", tipo: "cartao" },
  { nome: "PicPay", tipo: "cartao" },
  { nome: "Inter", tipo: "conta" },
  { nome: "Itaú", tipo: "conta" },
  { nome: "Renner", tipo: "cartao" },
  { nome: "Shopee", tipo: "cartao" },
  { nome: "Dinheiro", tipo: "conta" },
];

const CATEGORIAS: NovaCategoria[] = [
  // Necessidade — 50%
  { nome: "Alimentação", tipo: "despesa", grupo: "necessidade" },
  { nome: "Transporte", tipo: "despesa", grupo: "necessidade" },
  { nome: "Moradia", tipo: "despesa", grupo: "necessidade" },
  { nome: "Saúde", tipo: "despesa", grupo: "necessidade" },
  { nome: "Educação", tipo: "despesa", grupo: "necessidade" },
  { nome: "Tarifas/Taxas", tipo: "despesa", grupo: "necessidade" },

  // Desejo — 30%
  { nome: "Assinaturas", tipo: "despesa", grupo: "desejo" },
  { nome: "Lazer", tipo: "despesa", grupo: "desejo" },
  { nome: "Compras", tipo: "despesa", grupo: "desejo" },
  { nome: "Outros", tipo: "despesa", grupo: "desejo" },

  // Poupança e dívida — 20%
  { nome: "Dívidas/Parcelamentos", tipo: "despesa", grupo: "poupanca_divida" },
  { nome: "Empréstimos", tipo: "despesa", grupo: "poupanca_divida" },
  { nome: "Investimentos", tipo: "despesa", grupo: "poupanca_divida" },
  { nome: "Reserva de Emergência", tipo: "despesa", grupo: "poupanca_divida" },

  // Receita — grupo sempre nulo
  { nome: "Salário", tipo: "receita", grupo: null },
  { nome: "Bonificação", tipo: "receita", grupo: null },
  { nome: "Extra", tipo: "receita", grupo: null },
  { nome: "Freelance", tipo: "receita", grupo: null },
  { nome: "Outros", tipo: "receita", grupo: null },
];

async function main() {
  const contasCriadas = await db
    .insert(contas)
    .values(CONTAS)
    .onConflictDoNothing({ target: contas.nome })
    .returning({ nome: contas.nome });

  const categoriasCriadas = await db
    .insert(categorias)
    .values(CATEGORIAS)
    .onConflictDoNothing({ target: [categorias.nome, categorias.tipo] })
    .returning({ nome: categorias.nome });

  console.log(
    `Seed concluído.\n` +
      `  contas ...... ${contasCriadas.length} criadas, ` +
      `${CONTAS.length - contasCriadas.length} já existiam\n` +
      `  categorias .. ${categoriasCriadas.length} criadas, ` +
      `${CATEGORIAS.length - categoriasCriadas.length} já existiam`,
  );
}

main().catch((erro) => {
  console.error("Seed falhou:", erro);
  process.exit(1);
});
