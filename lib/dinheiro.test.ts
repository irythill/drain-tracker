import { describe, expect, it } from "vitest";
import { dividirCentavos, formatarBRL, paraCentavos } from "@/lib/dinheiro";

describe("paraCentavos", () => {
  // Casos 0 e 0b da §10 — a razão de `Math.round(v * 100)` ser proibido.
  it("arredonda 1.005 para 101, não 100", () => {
    expect(paraCentavos(1.005)).toBe(101);
    expect(Math.round(1.005 * 100)).toBe(100); // o comportamento errado
  });

  it("arredonda 8.165 para 817, não 816", () => {
    expect(paraCentavos(8.165)).toBe(817);
    expect(Math.round(8.165 * 100)).toBe(816); // o comportamento errado
  });

  // Casos obrigatórios do R4 da spec 001.
  it.each([
    [2.675, 268],
    [150.475, 15048],
    [0.005, 1],
    [188.93, 18893],
  ])("converte %f em %i centavos", (valor, esperado) => {
    expect(paraCentavos(valor)).toBe(esperado);
  });

  it("converte valores triviais", () => {
    expect(paraCentavos(0)).toBe(0);
    expect(paraCentavos(1)).toBe(100);
    expect(paraCentavos(2299 - 150)).toBe(214900);
    expect(paraCentavos(300.95 / 2)).toBe(15048);
  });

  it("preserva o sinal de valores negativos", () => {
    expect(paraCentavos(-1.005)).toBe(-101);
    expect(paraCentavos(-150.475)).toBe(-15048);
  });

  it("rejeita entrada que não é número finito", () => {
    expect(() => paraCentavos(Number.NaN)).toThrow();
    expect(() => paraCentavos(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("dividirCentavos", () => {
  // Casos 1, 2 e 3 da §10.
  it("divide 30095 em 2 partes", () => {
    expect(dividirCentavos(30095, 2)).toEqual([15048, 15047]);
  });

  it("divide 10000 em 3 partes", () => {
    expect(dividirCentavos(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("divide 1 em 3 partes", () => {
    expect(dividirCentavos(1, 3)).toEqual([1, 0, 0]);
  });

  it("a soma das partes é sempre igual ao total", () => {
    for (let total = 0; total <= 400; total++) {
      for (let n = 1; n <= 13; n++) {
        const partes = dividirCentavos(total, n);
        expect(partes).toHaveLength(n);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("distribui o resto nas primeiras partes, em ordem não-crescente", () => {
    const partes = dividirCentavos(558000, 36);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(558000);
    for (let i = 1; i < partes.length; i++) {
      expect(partes[i - 1]!).toBeGreaterThanOrEqual(partes[i]!);
    }
  });

  it("rejeita número de partes inválido", () => {
    expect(() => dividirCentavos(100, 0)).toThrow();
    expect(() => dividirCentavos(100, -1)).toThrow();
    expect(() => dividirCentavos(100, 1.5)).toThrow();
  });

  it("rejeita total que não é inteiro", () => {
    expect(() => dividirCentavos(100.5, 2)).toThrow();
  });
});

describe("formatarBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    //   é o espaço não-separável que o Intl insere após "R$".
    expect(formatarBRL(15048)).toBe("R$ 150,48");
    expect(formatarBRL(0)).toBe("R$ 0,00");
    expect(formatarBRL(-94696)).toBe("-R$ 946,96");
    expect(formatarBRL(214900)).toBe("R$ 2.149,00");
  });
});
