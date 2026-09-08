import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/dinheiro";
import { formatarRelatorio, type DadosRelatorio } from "@/lib/importacao-relatorio";

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
