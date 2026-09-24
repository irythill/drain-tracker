import type { DataISO } from "@/lib/data";
import type { StatusLancamento, TipoLancamento } from "@/lib/lancamento-schema";

const FORMATO_MES = /^(\d{4})-(\d{2})$/;

/** Parseia "YYYY-MM"; inválido devolve `null` — a página cai no mês atual. */
export function parseMes(valor: string): { ano: number; mes: number } | null {
  const m = FORMATO_MES.exec(valor);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;

  return { ano, mes };
}

export type LancamentoParaTotais = {
  tipo: TipoLancamento;
  status: StatusLancamento;
  valorCentavos: number;
};

export type TotaisDoMes = {
  receitasCentavos: number;
  despesasCentavos: number;
  saldoCentavos: number;
  pagoCentavos: number;
  aPagarCentavos: number;
};

/**
 * Totais do mês. `status` é competência, não caixa (§5.3): não muda
 * receitas/despesas, que somam por `data` independente de pago/pendente.
 * `pago`/`aPagar` só olham despesas — são KPIs informativos.
 */
export function totaisDoMes(lista: readonly LancamentoParaTotais[]): TotaisDoMes {
  let receitasCentavos = 0;
  let despesasCentavos = 0;
  let pagoCentavos = 0;
  let aPagarCentavos = 0;

  for (const lancamento of lista) {
    if (lancamento.tipo === "receita") {
      receitasCentavos += lancamento.valorCentavos;
      continue;
    }

    despesasCentavos += lancamento.valorCentavos;
    if (lancamento.status === "pago") {
      pagoCentavos += lancamento.valorCentavos;
    } else {
      aPagarCentavos += lancamento.valorCentavos;
    }
  }

  return {
    receitasCentavos,
    despesasCentavos,
    saldoCentavos: receitasCentavos - despesasCentavos,
    pagoCentavos,
    aPagarCentavos,
  };
}

export type LancamentoParaAtraso = {
  status: StatusLancamento;
  data: DataISO;
};

/**
 * Atrasado é só apresentação (§5.3): pendente com data já passada. Comparação
 * lexicográfica de "YYYY-MM-DD" é equivalente à cronológica.
 */
export function estaAtrasado(lancamento: LancamentoParaAtraso, hoje: DataISO): boolean {
  return lancamento.status === "pendente" && lancamento.data < hoje;
}
