import { describe, expect, it } from "vitest";
import {
  adicionaMeses,
  ehDataISO,
  fimDoMes,
  inicioDoMes,
  parseDataBR,
  parseDataPlanilha,
} from "@/lib/data";

describe("adicionaMeses", () => {
  // Casos 4 e 5 da §10 — saturação no último dia do mês de destino.
  it("satura 2026-01-31 + 1 mês em 2026-02-28", () => {
    expect(adicionaMeses("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("satura 2026-01-31 + 3 meses em 2026-04-30", () => {
    expect(adicionaMeses("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("respeita ano bissexto", () => {
    expect(adicionaMeses("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("atravessa a virada de ano", () => {
    expect(adicionaMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(adicionaMeses("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("aceita zero e valores negativos", () => {
    expect(adicionaMeses("2026-09-03", 0)).toBe("2026-09-03");
    expect(adicionaMeses("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("não acumula deriva: soma sempre a partir da primeira data", () => {
    // Somar 1 mês doze vezes != somar 12 meses (§2.1).
    expect(adicionaMeses("2026-01-31", 12)).toBe("2027-01-31");
  });

  it("não desloca o dia por timezone", () => {
    // Regressão: `new Date("2026-09-01")` é UTC e vira 31/08 em UTC-3.
    expect(adicionaMeses("2026-09-01", 0)).toBe("2026-09-01");
    expect(adicionaMeses("2026-01-01", 1)).toBe("2026-02-01");
  });

  it("rejeita data inválida", () => {
    expect(() => adicionaMeses("31/01/2026", 1)).toThrow();
    expect(() => adicionaMeses("2026-02-30", 1)).toThrow();
  });
});

describe("ehDataISO", () => {
  it("aceita datas civis válidas", () => {
    expect(ehDataISO("2026-09-03")).toBe(true);
    expect(ehDataISO("2024-02-29")).toBe(true);
  });

  it("rejeita formato errado ou dia inexistente", () => {
    expect(ehDataISO("2026-2-3")).toBe(false);
    expect(ehDataISO("03/09/2026")).toBe(false);
    expect(ehDataISO("2026-02-30")).toBe(false);
    expect(ehDataISO("2023-02-29")).toBe(false);
    expect(ehDataISO("2026-13-01")).toBe(false);
    expect(ehDataISO("2026-09-03T00:00:00Z")).toBe(false);
    expect(ehDataISO("")).toBe(false);
  });
});

describe("parseDataBR", () => {
  // R3: o formato é sempre brasileiro; 03/04/2026 é 3 de abril.
  it("converte dd/MM/yyyy para YYYY-MM-DD", () => {
    expect(parseDataBR("03/04/2026")).toBe("2026-04-03");
    expect(parseDataBR("21/09/2026")).toBe("2026-09-21");
    expect(parseDataBR("27/09/2026")).toBe("2026-09-27");
  });

  it("tolera espaços nas pontas e dígitos sem zero à esquerda", () => {
    expect(parseDataBR("  3/4/2026 ")).toBe("2026-04-03");
  });

  it("devolve null quando não dá para converter", () => {
    expect(parseDataBR("31/02/2026")).toBeNull();
    expect(parseDataBR("hoje")).toBeNull();
    expect(parseDataBR("2026-04-03")).toBeNull();
    expect(parseDataBR("")).toBeNull();
  });
});

describe("parseDataPlanilha", () => {
  it("aceita data nativa sem aviso", () => {
    // Meia-noite UTC é como o ExcelJS entrega uma data sem hora.
    const nativa = new Date(Date.UTC(2026, 8, 21));
    expect(parseDataPlanilha(nativa)).toEqual({
      data: "2026-09-21",
      aviso: null,
    });
  });

  it("converte texto dd/MM/yyyy e registra aviso", () => {
    expect(parseDataPlanilha("21/09/2026")).toEqual({
      data: "2026-09-21",
      aviso: 'data em texto "21/09/2026" convertida',
    });
  });

  it("aceita texto já em ISO e registra aviso", () => {
    expect(parseDataPlanilha("2026-09-21")).toEqual({
      data: "2026-09-21",
      aviso: 'data em texto "2026-09-21" convertida',
    });
  });

  it("devolve erro quando não é data", () => {
    const r = parseDataPlanilha("qualquer coisa");
    expect(r.data).toBeNull();
    expect(r.erro).toBeTruthy();
  });

  it("devolve erro para célula vazia", () => {
    expect(parseDataPlanilha(null).data).toBeNull();
    expect(parseDataPlanilha(undefined).data).toBeNull();
    expect(parseDataPlanilha("").data).toBeNull();
  });
});

describe("intervalo do mês", () => {
  it("calcula o primeiro e o último dia", () => {
    expect(inicioDoMes(2026, 9)).toBe("2026-09-01");
    expect(fimDoMes(2026, 9)).toBe("2026-09-30");
    expect(fimDoMes(2026, 2)).toBe("2026-02-28");
    expect(fimDoMes(2024, 2)).toBe("2024-02-29");
    expect(fimDoMes(2026, 12)).toBe("2026-12-31");
  });

  it("rejeita mês fora da faixa", () => {
    expect(() => inicioDoMes(2026, 0)).toThrow();
    expect(() => fimDoMes(2026, 13)).toThrow();
  });
});
