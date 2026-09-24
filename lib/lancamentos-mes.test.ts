import { describe, expect, it } from "vitest";
import { estaAtrasado, parseMes, totaisDoMes } from "@/lib/lancamentos-mes";

describe("parseMes", () => {
  it("parseia um mês válido", () => {
    expect(parseMes("2026-03")).toEqual({ ano: 2026, mes: 3 });
  });

  it.each(["2026-13", "2026-00", "26-03", "2026/03", "", "lixo", "2026-3"])(
    "rejeita formato inválido: %s",
    (valor) => {
      expect(parseMes(valor)).toBeNull();
    },
  );
});

describe("totaisDoMes", () => {
  it("soma receitas e despesas por tipo, ignorando status", () => {
    const lista = [
      { tipo: "receita" as const, status: "pago" as const, valorCentavos: 300000 },
      { tipo: "receita" as const, status: "pendente" as const, valorCentavos: 50000 },
      { tipo: "despesa" as const, status: "pago" as const, valorCentavos: 15000 },
      { tipo: "despesa" as const, status: "pendente" as const, valorCentavos: 8000 },
    ];

    const totais = totaisDoMes(lista);

    expect(totais.receitasCentavos).toBe(350000);
    expect(totais.despesasCentavos).toBe(23000);
    expect(totais.saldoCentavos).toBe(327000);
  });

  it("pagoCentavos e aPagarCentavos consideram só despesas", () => {
    const lista = [
      { tipo: "receita" as const, status: "pendente" as const, valorCentavos: 100000 },
      { tipo: "despesa" as const, status: "pago" as const, valorCentavos: 4000 },
      { tipo: "despesa" as const, status: "pago" as const, valorCentavos: 6000 },
      { tipo: "despesa" as const, status: "pendente" as const, valorCentavos: 2000 },
    ];

    const totais = totaisDoMes(lista);

    expect(totais.pagoCentavos).toBe(10000);
    expect(totais.aPagarCentavos).toBe(2000);
  });

  it("mês vazio soma tudo zero, sem divisão por zero", () => {
    expect(totaisDoMes([])).toEqual({
      receitasCentavos: 0,
      despesasCentavos: 0,
      saldoCentavos: 0,
      pagoCentavos: 0,
      aPagarCentavos: 0,
    });
  });
});

describe("estaAtrasado", () => {
  const HOJE = "2026-03-15";

  it("pendente com data passada está atrasado", () => {
    expect(estaAtrasado({ status: "pendente", data: "2026-03-10" }, HOJE)).toBe(true);
  });

  it("pendente com data futura não está atrasado", () => {
    expect(estaAtrasado({ status: "pendente", data: "2026-03-20" }, HOJE)).toBe(false);
  });

  it("pendente com data de hoje não está atrasado", () => {
    expect(estaAtrasado({ status: "pendente", data: HOJE }, HOJE)).toBe(false);
  });

  it("pago nunca está atrasado, mesmo com data passada", () => {
    expect(estaAtrasado({ status: "pago", data: "2026-01-01" }, HOJE)).toBe(false);
  });
});
