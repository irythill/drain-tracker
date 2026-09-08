import { describe, expect, it } from "vitest";
import { gerarParcelas } from "@/lib/parcelamento";

const plano = {
  descricao: "Empréstimo",
  valorTotalCentavos: 30095,
  numParcelas: 2,
  primeiraData: "2026-09-21",
};

describe("gerarParcelas", () => {
  it("distribui o resto e mantém a soma igual ao total", () => {
    const parcelas = gerarParcelas(plano);
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([15048, 15047]);
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(30095);
  });

  it("numera e descreve cada parcela como n/N", () => {
    const parcelas = gerarParcelas(plano);
    expect(parcelas.map((p) => p.descricao)).toEqual([
      "Empréstimo 1/2",
      "Empréstimo 2/2",
    ]);
    expect(parcelas.map((p) => p.numeroParcela)).toEqual([1, 2]);
  });

  it("nasce como despesa pendente", () => {
    for (const parcela of gerarParcelas(plano)) {
      expect(parcela.tipo).toBe("despesa");
      expect(parcela.status).toBe("pendente");
    }
  });

  // Caso 6 da §10.
  it("gera 36 parcelas de 558000 sem perder centavo nem derivar a data", () => {
    const parcelas = gerarParcelas({
      descricao: "Consórcio",
      valorTotalCentavos: 558000,
      numParcelas: 36,
      primeiraData: "2026-01-31",
    });

    expect(parcelas).toHaveLength(36);
    expect(parcelas.reduce((s, p) => s + p.valorCentavos, 0)).toBe(558000);
    expect(parcelas[0]!.data).toBe("2026-01-31");
    // A última parcela é primeira + 35 meses, contada da primeira data.
    expect(parcelas[35]!.data).toBe("2028-12-31");
  });

  it("calcula cada data a partir da primeira, saturando no fim do mês", () => {
    const parcelas = gerarParcelas({
      descricao: "Curso",
      valorTotalCentavos: 30000,
      numParcelas: 4,
      primeiraData: "2026-01-31",
    });

    expect(parcelas.map((p) => p.data)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // volta para 31: não deriva a partir de 28/02
      "2026-04-30",
    ]);
  });

  it("aceita parcela única", () => {
    const parcelas = gerarParcelas({ ...plano, numParcelas: 1 });
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]!.valorCentavos).toBe(30095);
    expect(parcelas[0]!.descricao).toBe("Empréstimo 1/1");
  });

  it("rejeita plano fora das invariantes do schema", () => {
    expect(() => gerarParcelas({ ...plano, valorTotalCentavos: 0 })).toThrow();
    expect(() => gerarParcelas({ ...plano, numParcelas: 0 })).toThrow();
    expect(() => gerarParcelas({ ...plano, numParcelas: 121 })).toThrow();
    expect(() => gerarParcelas({ ...plano, primeiraData: "21/09/2026" })).toThrow();
  });
});
