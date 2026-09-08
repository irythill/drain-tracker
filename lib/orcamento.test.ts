import { describe, expect, it } from "vitest";
import { calcularPainel, divergenciaDeRenda } from "@/lib/orcamento";

const orcamento = {
  rendaDisponivelCentavos: 328200,
  pctNecessidade: 50,
  pctDesejo: 30,
  pctPoupanca: 20,
};

const totais = {
  receitasCentavos: 214900,
  despesasCentavos: 309596,
  porGrupo: {
    necessidade: 150000,
    desejo: 100000,
    poupanca_divida: 59596,
  },
};

describe("calcularPainel", () => {
  it("calcula saldo e taxa de poupança", () => {
    const p = calcularPainel(totais, orcamento);
    expect(p.saldoCentavos).toBe(214900 - 309596);
    expect(p.taxaPoupanca).toBeCloseTo(-94696 / 214900, 10);
  });

  // Caso 9 da §10.
  it("mês sem receita: taxa de poupança 0, sem divisão por zero", () => {
    const p = calcularPainel(
      { ...totais, receitasCentavos: 0 },
      orcamento,
    );
    expect(p.taxaPoupanca).toBe(0);
    expect(Number.isFinite(p.taxaPoupanca)).toBe(true);
  });

  it("taxa de poupança negativa é informação legítima, não erro", () => {
    const p = calcularPainel(totais, orcamento);
    expect(p.taxaPoupanca).toBeLessThan(0);
  });

  it("calcula meta, real e diferença por grupo", () => {
    const p = calcularPainel(totais, orcamento);
    expect(p.grupos.necessidade.metaCentavos).toBe(164100);
    expect(p.grupos.desejo.metaCentavos).toBe(98460);
    expect(p.grupos.poupanca_divida.metaCentavos).toBe(65640);

    expect(p.grupos.necessidade.realCentavos).toBe(150000);
    expect(p.grupos.necessidade.diferencaCentavos).toBe(164100 - 150000);
    expect(p.grupos.desejo.diferencaCentavos).toBe(98460 - 100000);
  });

  it("a soma das metas pode divergir da renda em até 2 centavos", () => {
    const p = calcularPainel(totais, { ...orcamento, rendaDisponivelCentavos: 333333 });
    const soma =
      p.grupos.necessidade.metaCentavos! +
      p.grupos.desejo.metaCentavos! +
      p.grupos.poupanca_divida.metaCentavos!;
    expect(Math.abs(soma - 333333)).toBeLessThanOrEqual(2);
  });

  it("trata grupo sem gasto no mês como zero", () => {
    const p = calcularPainel(
      { ...totais, porGrupo: { necessidade: 150000 } },
      orcamento,
    );
    expect(p.grupos.desejo.realCentavos).toBe(0);
    expect(p.grupos.poupanca_divida.realCentavos).toBe(0);
  });

  // Caso 10 da §10: sem registro de orçamento o painel ainda renderiza.
  it("sem orçamento do mês, calcula o que não depende dele", () => {
    const p = calcularPainel(totais, null);
    expect(p.saldoCentavos).toBe(-94696);
    expect(p.grupos.necessidade.metaCentavos).toBeNull();
    expect(p.grupos.necessidade.realCentavos).toBe(150000);
    expect(p.grupos.necessidade.diferencaCentavos).toBeNull();
  });
});

describe("divergenciaDeRenda", () => {
  // §7.2: divergência é exibida, nunca corrigida em silêncio.
  it("acusa quando a renda informada diverge das receitas em mais de 1%", () => {
    const d = divergenciaDeRenda(328200, 214900);
    expect(d).not.toBeNull();
    expect(d!.diferencaCentavos).toBe(328200 - 214900);
  });

  it("não acusa divergência dentro de 1%", () => {
    expect(divergenciaDeRenda(214900, 214900)).toBeNull();
    expect(divergenciaDeRenda(214900, 214000)).toBeNull();
  });

  it("acusa quando não há receita lançada mas há renda informada", () => {
    expect(divergenciaDeRenda(328200, 0)).not.toBeNull();
  });

  it("não acusa quando ambos são zero", () => {
    expect(divergenciaDeRenda(0, 0)).toBeNull();
  });
});
