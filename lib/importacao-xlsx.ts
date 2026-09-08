/**
 * Extração de linhas brutas da planilha `.xlsx` (R1, R2 da spec 001).
 *
 * Único ponto do importador que toca a API do ExcelJS — devolve dados
 * primitivos (`LinhaLancamentoBruta`/`LinhaDividaBruta`) para as regras de
 * negócio em `lib/importacao.ts`, que não sabem nada sobre planilha.
 */

import type { Worksheet } from "exceljs";
import { linhaTemDado, type LinhaDividaBruta, type LinhaLancamentoBruta } from "@/lib/importacao";

export class ErroValorFormula extends Error {}

interface CelulaFormula {
  formula: string;
  result?: unknown;
}

function ehCelulaFormula(valor: unknown): valor is CelulaFormula {
  return valor !== null && typeof valor === "object" && "formula" in valor;
}

/**
 * Lê o valor calculado de uma célula, exigindo o cache da fórmula (R2).
 * Abortar toda a execução aqui — não pular a linha — é intencional: sem o
 * cache, nenhum valor da planilha é confiável.
 */
function valorCelula(worksheet: Worksheet, linha: number, coluna: number): unknown {
  const bruto = worksheet.getRow(linha).getCell(coluna).value;
  if (!ehCelulaFormula(bruto)) return bruto;

  if (bruto.result === undefined) {
    throw new ErroValorFormula(
      `linha ${linha}: fórmula "${bruto.formula}" sem valor calculado em cache — ` +
        "abra a planilha, salve uma vez para gerar o cache e importe novamente",
    );
  }
  return bruto.result;
}

const COLUNAS_LANCAMENTOS = {
  data: 2,
  conta: 3,
  descricao: 4,
  categoria: 5,
  formaPagamento: 7,
  tipo: 8,
  valor: 9,
  status: 10,
} as const;

/**
 * Percorre a aba Lançamentos até o fim real da planilha, sem depender de um
 * limite fixo de linhas — só é dado o que tem data (B) e valor (I) (R1).
 */
export function lerLinhasLancamentos(
  worksheet: Worksheet,
  primeiraLinha = 6,
): LinhaLancamentoBruta[] {
  const linhas: LinhaLancamentoBruta[] = [];

  for (let linha = primeiraLinha; linha <= worksheet.rowCount; linha++) {
    const data = valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.data);
    const valor = valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.valor);
    if (!linhaTemDado(data, valor)) continue;

    linhas.push({
      linha,
      data,
      conta: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.conta),
      descricao: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.descricao),
      categoria: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.categoria),
      formaPagamento: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.formaPagamento),
      tipo: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.tipo),
      valor,
      status: valorCelula(worksheet, linha, COLUNAS_LANCAMENTOS.status),
    });
  }

  return linhas;
}

const COLUNAS_DIVIDAS = { pessoa: 2, valorTotal: 3, jaPago: 4 } as const;

/** Lê a aba Dívidas, linhas 6–15; só é dado o que tem pessoa (B) (R11). */
export function lerLinhasDividas(
  worksheet: Worksheet,
  primeiraLinha = 6,
  ultimaLinha = 15,
): LinhaDividaBruta[] {
  const linhas: LinhaDividaBruta[] = [];

  for (let linha = primeiraLinha; linha <= ultimaLinha; linha++) {
    const pessoa = valorCelula(worksheet, linha, COLUNAS_DIVIDAS.pessoa);
    if (pessoa === null || pessoa === undefined || pessoa === "") continue;

    const valorTotal = valorCelula(worksheet, linha, COLUNAS_DIVIDAS.valorTotal);
    const jaPago = valorCelula(worksheet, linha, COLUNAS_DIVIDAS.jaPago);

    linhas.push({
      linha,
      pessoa,
      valorTotal: typeof valorTotal === "number" ? valorTotal : Number(valorTotal),
      jaPago: typeof jaPago === "number" ? jaPago : Number(jaPago ?? 0),
    });
  }

  return linhas;
}
