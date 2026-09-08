import { adicionaMeses, ehDataISO, type DataISO } from "@/lib/data";
import { dividirCentavos } from "@/lib/dinheiro";

/**
 * Geração de parcelas a partir da intenção de um parcelamento.
 * Ver `specs/dominio-financeiro.md` §6.
 */

/** A intenção guardada em `parcelamentos`. */
export type PlanoParcelamento = {
  descricao: string;
  valorTotalCentavos: number;
  numParcelas: number;
  primeiraData: DataISO;
};

/** Uma parcela pronta para virar linha em `lancamentos`. */
export type ParcelaGerada = {
  data: DataISO;
  descricao: string;
  valorCentavos: number;
  tipo: "despesa";
  status: "pendente";
  numeroParcela: number;
};

/**
 * Expande o plano nas parcelas que serão gravadas como lançamentos reais.
 *
 * Invariante: a soma de `valorCentavos` das parcelas é exatamente
 * `valorTotalCentavos`.
 */
export function gerarParcelas(plano: PlanoParcelamento): ParcelaGerada[] {
  const { descricao, valorTotalCentavos, numParcelas, primeiraData } = plano;

  if (!Number.isInteger(valorTotalCentavos) || valorTotalCentavos <= 0) {
    throw new Error(
      `Valor total deve ser inteiro positivo em centavos: ${valorTotalCentavos}`,
    );
  }
  if (!Number.isInteger(numParcelas) || numParcelas < 1 || numParcelas > 120) {
    throw new Error(`Número de parcelas deve estar entre 1 e 120: ${numParcelas}`);
  }
  if (!ehDataISO(primeiraData)) {
    throw new Error(`Data da primeira parcela inválida: "${primeiraData}"`);
  }

  const partes = dividirCentavos(valorTotalCentavos, numParcelas);

  return partes.map((valorCentavos, i) => ({
    // Sempre a partir da primeira data — nunca da parcela anterior (§2.1).
    data: adicionaMeses(primeiraData, i),
    descricao: `${descricao} ${i + 1}/${numParcelas}`,
    valorCentavos,
    tipo: "despesa" as const,
    status: "pendente" as const,
    numeroParcela: i + 1,
  }));
}
