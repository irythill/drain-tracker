/**
 * Relatório final da importação (R12 da spec 001). Função pura: recebe os
 * números já apurados e devolve o texto impresso no fim do comando.
 */

import { formatarBRL } from "@/lib/dinheiro";

export interface ContadoresLancamentos {
  criados: number;
  ignorados: number;
  comErro: number;
}

export interface ResumoDividas {
  criadas: number;
  totalCentavos: number;
}

export interface DadosRelatorio {
  arquivo: string;
  modo: "DRY-RUN" | "COMMIT";
  lancamentos: ContadoresLancamentos;
  totalReceitasCentavos: number;
  totalDespesasCentavos: number;
  dividas: ResumoDividas;
  avisos: string[];
  erros: string[];
}

export function formatarRelatorio(dados: DadosRelatorio): string {
  const saldoCentavos = dados.totalReceitasCentavos - dados.totalDespesasCentavos;

  const linhas = [
    `Importação: ${dados.arquivo}   [${dados.modo}]`,
    "",
    "Lançamentos",
    `  criados ................... ${dados.lancamentos.criados}`,
    `  ignorados (linha vazia) ... ${dados.lancamentos.ignorados}`,
    `  com erro ................... ${dados.lancamentos.comErro}`,
    "",
    `Receitas ..... ${formatarBRL(dados.totalReceitasCentavos)}`,
    `Despesas ..... ${formatarBRL(dados.totalDespesasCentavos)}`,
    `Saldo ........ ${formatarBRL(saldoCentavos)}`,
    "",
    `Dívidas: ${dados.dividas.criadas} criadas, total ${formatarBRL(dados.dividas.totalCentavos)}`,
    "",
    `Avisos (${dados.avisos.length})`,
    ...dados.avisos.map((a) => `  ${a}`),
    "",
    `Erros (${dados.erros.length})`,
    ...dados.erros.map((e) => `  ${e}`),
  ];

  return linhas.join("\n");
}
