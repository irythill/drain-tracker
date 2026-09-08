/**
 * Relatório final da importação (R12 da spec 001). Função pura: recebe os
 * números já apurados e devolve o texto impresso no fim do comando.
 */

import { formatarBRL } from "@/lib/dinheiro";
import type { ResultadoLinhaDivida, ResultadoLinhaLancamento } from "@/lib/importacao";

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

export interface ParametrosMontagemRelatorio {
  arquivo: string;
  modo: "DRY-RUN" | "COMMIT";
  ignoradas: number;
  resultadosLancamentos: ResultadoLinhaLancamento[];
  resultadosDividas: (ResultadoLinhaDivida | null)[];
}

/**
 * Agrega os resultados de todas as linhas processadas nos números do
 * relatório final (R12). Função pura — não sabe nada sobre banco ou xlsx.
 */
export function montarDadosRelatorio(params: ParametrosMontagemRelatorio): DadosRelatorio {
  const avisos: string[] = [];
  const erros: string[] = [];
  let criados = 0;
  let comErro = 0;
  let totalReceitasCentavos = 0;
  let totalDespesasCentavos = 0;

  for (const resultado of params.resultadosLancamentos) {
    if (!resultado.ok) {
      comErro++;
      erros.push(`linha ${resultado.linha}  ${resultado.erro}`);
      continue;
    }
    criados++;
    avisos.push(...resultado.avisos);
    if (resultado.lancamento.tipo === "receita") {
      totalReceitasCentavos += resultado.lancamento.valorCentavos;
    } else {
      totalDespesasCentavos += resultado.lancamento.valorCentavos;
    }
  }

  let dividasCriadas = 0;
  let dividasTotalCentavos = 0;
  for (const resultado of params.resultadosDividas) {
    if (resultado === null) continue;
    if (!resultado.ok) {
      erros.push(`linha ${resultado.linha}  ${resultado.erro}`);
      continue;
    }
    dividasCriadas++;
    dividasTotalCentavos += resultado.divida.valorTotalCentavos;
  }

  return {
    arquivo: params.arquivo,
    modo: params.modo,
    lancamentos: { criados, ignorados: params.ignoradas, comErro },
    totalReceitasCentavos,
    totalDespesasCentavos,
    dividas: { criadas: dividasCriadas, totalCentavos: dividasTotalCentavos },
    avisos,
    erros,
  };
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
