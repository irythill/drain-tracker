import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/dinheiro";
import type { ResultadoLinhaDivida, ResultadoLinhaLancamento } from "@/lib/importacao";
import {
  formatarRelatorio,
  montarDadosRelatorio,
  type DadosRelatorio,
} from "@/lib/importacao-relatorio";

function dadosBase(overrides: Partial<DadosRelatorio> = {}): DadosRelatorio {
  return {
    arquivo: "FINANÇAS_ULTIMATE.xlsx",
    modo: "DRY-RUN",
    lancamentos: { criados: 35, ignorados: 0, comErro: 0 },
    totalReceitasCentavos: 214900,
    totalDespesasCentavos: 309596,
    dividas: { criadas: 2, totalCentavos: 695199 },
    avisos: [],
    erros: [],
    ...overrides,
  };
}

describe("formatarRelatorio (R12)", () => {
  it("inclui nome do arquivo e modo", () => {
    const texto = formatarRelatorio(dadosBase({ modo: "COMMIT" }));
    expect(texto).toContain("FINANÇAS_ULTIMATE.xlsx");
    expect(texto).toContain("COMMIT");
  });

  it("inclui contadores de lançamentos", () => {
    const texto = formatarRelatorio(
      dadosBase({ lancamentos: { criados: 35, ignorados: 2, comErro: 1 } }),
    );
    expect(texto).toContain("35");
    expect(texto).toContain("2");
    expect(texto).toContain("1");
  });

  it("formata receitas, despesas e saldo em BRL", () => {
    const texto = formatarRelatorio(dadosBase());
    expect(texto).toContain(formatarBRL(214900));
    expect(texto).toContain(formatarBRL(309596));
    expect(texto).toContain(formatarBRL(-94696));
  });

  it("saldo positivo não tem sinal de menos", () => {
    const texto = formatarRelatorio(
      dadosBase({ totalReceitasCentavos: 500000, totalDespesasCentavos: 100000 }),
    );
    expect(texto).toContain(formatarBRL(400000));
    expect(texto).not.toContain(formatarBRL(-400000));
  });

  it("inclui resumo de dívidas", () => {
    const texto = formatarRelatorio(dadosBase());
    expect(texto).toContain("2 criadas");
    expect(texto).toContain(formatarBRL(695199));
  });

  it("lista avisos com contagem no cabeçalho", () => {
    const texto = formatarRelatorio(
      dadosBase({
        avisos: [
          'linha 40  data em texto "27/09/2026" convertida',
          "linha 7  valor 150.475 arredondado para R$ 150,48",
        ],
      }),
    );
    expect(texto).toContain("Avisos (2)");
    expect(texto).toContain('data em texto "27/09/2026" convertida');
    expect(texto).toContain("arredondado para R$ 150,48");
  });

  it("lista erros com contagem no cabeçalho", () => {
    const texto = formatarRelatorio(
      dadosBase({ erros: ["linha 15  tipo não reconhecido"] }),
    );
    expect(texto).toContain("Erros (1)");
    expect(texto).toContain("tipo não reconhecido");
  });

  it("sem avisos e sem erros mostra contagem zero", () => {
    const texto = formatarRelatorio(dadosBase());
    expect(texto).toContain("Avisos (0)");
    expect(texto).toContain("Erros (0)");
  });
});

function lancamentoOk(
  overrides: Partial<Extract<ResultadoLinhaLancamento, { ok: true }>["lancamento"]> = {},
  avisos: string[] = [],
  linha = 6,
): ResultadoLinhaLancamento {
  return {
    ok: true,
    linha,
    avisos,
    lancamento: {
      data: "2026-09-05",
      descricao: "Item",
      valorCentavos: 1000,
      tipo: "despesa",
      categoriaId: 1,
      contaId: 1,
      formaPagamento: "pix",
      status: "pendente",
      ...overrides,
    },
  };
}

function lancamentoErro(linha: number, erro: string): ResultadoLinhaLancamento {
  return { ok: false, linha, erro };
}

describe("montarDadosRelatorio", () => {
  it("soma receitas e despesas separadamente e conta criados/com erro", () => {
    const dados = montarDadosRelatorio({
      arquivo: "arquivo.xlsx",
      modo: "DRY-RUN",
      ignoradas: 3,
      resultadosLancamentos: [
        lancamentoOk({ tipo: "receita", valorCentavos: 214900 }),
        lancamentoOk({ tipo: "despesa", valorCentavos: 5445 }),
        lancamentoOk({ tipo: "despesa", valorCentavos: 15048 }),
        lancamentoErro(15, "tipo não reconhecido"),
      ],
      resultadosDividas: [],
    });

    expect(dados.lancamentos).toEqual({ criados: 3, ignorados: 3, comErro: 1 });
    expect(dados.totalReceitasCentavos).toBe(214900);
    expect(dados.totalDespesasCentavos).toBe(20493);
    expect(dados.erros).toEqual(["linha 15  tipo não reconhecido"]);
  });

  it("concatena avisos de todas as linhas aceitas, na ordem", () => {
    const dados = montarDadosRelatorio({
      arquivo: "arquivo.xlsx",
      modo: "DRY-RUN",
      ignoradas: 0,
      resultadosLancamentos: [
        lancamentoOk({}, ['linha 7  valor arredondado'], 7),
        lancamentoOk({}, ['linha 12  categoria "X" criada'], 12),
      ],
      resultadosDividas: [],
    });

    expect(dados.avisos).toEqual([
      "linha 7  valor arredondado",
      'linha 12  categoria "X" criada',
    ]);
  });

  it("resume dívidas aceitas e reporta erro de dívida inválida", () => {
    const dividaOk: ResultadoLinhaDivida = {
      ok: true,
      divida: { pessoa: "MÃE", valorTotalCentavos: 340447, pagamentoInicial: null },
    };
    const dividaErro: ResultadoLinhaDivida = {
      ok: false,
      linha: 9,
      erro: 'valor total da dívida inválido: "NaN"',
    };

    const dados = montarDadosRelatorio({
      arquivo: "arquivo.xlsx",
      modo: "COMMIT",
      ignoradas: 0,
      resultadosLancamentos: [],
      resultadosDividas: [dividaOk, dividaErro],
    });

    expect(dados.dividas).toEqual({ criadas: 1, totalCentavos: 340447 });
    expect(dados.erros).toEqual(['linha 9  valor total da dívida inválido: "NaN"']);
  });

  it("ignora linhas de dívida sem pessoa (null) sem afetar contagens", () => {
    const dados = montarDadosRelatorio({
      arquivo: "arquivo.xlsx",
      modo: "COMMIT",
      ignoradas: 0,
      resultadosLancamentos: [],
      resultadosDividas: [null, null],
    });

    expect(dados.dividas).toEqual({ criadas: 0, totalCentavos: 0 });
    expect(dados.erros).toEqual([]);
  });

  it("relatório vazio tem tudo zerado", () => {
    const dados = montarDadosRelatorio({
      arquivo: "arquivo.xlsx",
      modo: "DRY-RUN",
      ignoradas: 0,
      resultadosLancamentos: [],
      resultadosDividas: [],
    });

    expect(dados).toEqual({
      arquivo: "arquivo.xlsx",
      modo: "DRY-RUN",
      lancamentos: { criados: 0, ignorados: 0, comErro: 0 },
      totalReceitasCentavos: 0,
      totalDespesasCentavos: 0,
      dividas: { criadas: 0, totalCentavos: 0 },
      avisos: [],
      erros: [],
    });
  });
});
