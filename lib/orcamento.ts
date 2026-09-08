/**
 * Painel mensal e regra 50/30/20.
 * Ver `specs/dominio-financeiro.md` §7.
 */

export type Grupo = "necessidade" | "desejo" | "poupanca_divida";

export const GRUPOS: readonly Grupo[] = [
  "necessidade",
  "desejo",
  "poupanca_divida",
];

/** Totais do mês, já agregados por query. */
export type TotaisDoMes = {
  receitasCentavos: number;
  despesasCentavos: number;
  /** Despesa por grupo; grupo ausente conta como zero. */
  porGrupo: Partial<Record<Grupo, number>>;
};

/** O registro de `orcamentos_mensais` do mês, quando existe. */
export type OrcamentoDoMes = {
  rendaDisponivelCentavos: number;
  pctNecessidade: number;
  pctDesejo: number;
  pctPoupanca: number;
};

export type LinhaDeGrupo = {
  grupo: Grupo;
  /** `null` quando não há orçamento gravado para o mês. */
  metaCentavos: number | null;
  realCentavos: number;
  /** `meta - real`; `null` sem orçamento. */
  diferencaCentavos: number | null;
};

export type Painel = {
  receitasCentavos: number;
  despesasCentavos: number;
  saldoCentavos: number;
  /** Pode ser negativa — mês com saldo negativo é informação, não erro. */
  taxaPoupanca: number;
  grupos: Record<Grupo, LinhaDeGrupo>;
};

function pctDoGrupo(grupo: Grupo, orcamento: OrcamentoDoMes): number {
  switch (grupo) {
    case "necessidade":
      return orcamento.pctNecessidade;
    case "desejo":
      return orcamento.pctDesejo;
    case "poupanca_divida":
      return orcamento.pctPoupanca;
  }
}

/**
 * Monta o painel do mês.
 *
 * Sem registro em `orcamentos_mensais` o painel ainda renderiza: metas e
 * diferenças ficam `null` e o resto é calculado normalmente.
 */
export function calcularPainel(
  totais: TotaisDoMes,
  orcamento: OrcamentoDoMes | null,
): Painel {
  const { receitasCentavos, despesasCentavos } = totais;
  const saldoCentavos = receitasCentavos - despesasCentavos;

  const grupos = Object.fromEntries(
    GRUPOS.map((grupo): [Grupo, LinhaDeGrupo] => {
      const realCentavos = totais.porGrupo[grupo] ?? 0;
      const metaCentavos = orcamento
        ? Math.round(
            (orcamento.rendaDisponivelCentavos * pctDoGrupo(grupo, orcamento)) / 100,
          )
        : null;

      return [
        grupo,
        {
          grupo,
          metaCentavos,
          realCentavos,
          diferencaCentavos: metaCentavos === null ? null : metaCentavos - realCentavos,
        },
      ];
    }),
  ) as Record<Grupo, LinhaDeGrupo>;

  return {
    receitasCentavos,
    despesasCentavos,
    saldoCentavos,
    taxaPoupanca: receitasCentavos === 0 ? 0 : saldoCentavos / receitasCentavos,
    grupos,
  };
}

export type Divergencia = {
  rendaDisponivelCentavos: number;
  receitasLancadasCentavos: number;
  diferencaCentavos: number;
};

/**
 * Compara a renda informada com as receitas efetivamente lançadas (§7.2).
 *
 * Devolve `null` quando batem dentro de 1%. Divergência é exibida com os dois
 * números — nunca corrigida em silêncio, que foi o erro da planilha.
 */
export function divergenciaDeRenda(
  rendaDisponivelCentavos: number,
  receitasLancadasCentavos: number,
): Divergencia | null {
  const diferencaCentavos = rendaDisponivelCentavos - receitasLancadasCentavos;
  if (diferencaCentavos === 0) return null;

  // Sem receita lançada não há base de comparação: qualquer renda diverge.
  const divergente =
    receitasLancadasCentavos === 0 ||
    Math.abs(diferencaCentavos) / receitasLancadasCentavos > 0.01;

  return divergente
    ? { rendaDisponivelCentavos, receitasLancadasCentavos, diferencaCentavos }
    : null;
}
