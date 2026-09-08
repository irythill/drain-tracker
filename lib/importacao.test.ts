import { describe, expect, it, vi } from "vitest";
import {
  converterValorImportado,
  grupoPadraoParaTipo,
  linhaTemDado,
  mapearFormaPagamento,
  mapearStatus,
  mapearTipoTransacao,
  processarLinhaDivida,
  processarLinhaLancamento,
  type BuscarCategoria,
  type BuscarConta,
} from "@/lib/importacao";

describe("grupoPadraoParaTipo", () => {
  it("despesa recebe grupo desejo por padrão (R5)", () => {
    expect(grupoPadraoParaTipo("despesa")).toBe("desejo");
  });

  it("receita não recebe grupo", () => {
    expect(grupoPadraoParaTipo("receita")).toBeNull();
  });
});

describe("linhaTemDado (R1)", () => {
  it("linha com data e valor preenchidos é válida", () => {
    expect(linhaTemDado(new Date(), 100)).toBe(true);
  });

  it("linha sem data é ignorada", () => {
    expect(linhaTemDado(null, 100)).toBe(false);
    expect(linhaTemDado("", 100)).toBe(false);
    expect(linhaTemDado(undefined, 100)).toBe(false);
  });

  it("linha sem valor é ignorada", () => {
    expect(linhaTemDado(new Date(), null)).toBe(false);
    expect(linhaTemDado(new Date(), "")).toBe(false);
  });

  it("linha totalmente vazia (fórmula retornando '') é ignorada", () => {
    expect(linhaTemDado("", "")).toBe(false);
  });
});

describe("mapearTipoTransacao (R6)", () => {
  it("mapeia Receita e Despesa sem acento/caixa", () => {
    expect(mapearTipoTransacao("Receita")).toBe("receita");
    expect(mapearTipoTransacao("despesa")).toBe("despesa");
    expect(mapearTipoTransacao("  DESPESA  ")).toBe("despesa");
  });

  it("valor não reconhecido retorna null", () => {
    expect(mapearTipoTransacao("Transferência")).toBeNull();
    expect(mapearTipoTransacao(null)).toBeNull();
  });
});

describe("mapearFormaPagamento (R6)", () => {
  it("mapeia formas conhecidas ignorando acento e caixa", () => {
    expect(mapearFormaPagamento("Débito")).toBe("debito");
    expect(mapearFormaPagamento("Crédito")).toBe("credito");
    expect(mapearFormaPagamento("Pix")).toBe("pix");
    expect(mapearFormaPagamento("Dinheiro")).toBe("dinheiro");
    expect(mapearFormaPagamento("Boleto")).toBe("boleto");
    expect(mapearFormaPagamento("credito")).toBe("credito");
  });

  it("valor não reconhecido retorna null", () => {
    expect(mapearFormaPagamento("Cheque")).toBeNull();
  });
});

describe("mapearStatus (R6)", () => {
  it("mapeia Pago e Pendente", () => {
    expect(mapearStatus("Pago")).toBe("pago");
    expect(mapearStatus("pendente")).toBe("pendente");
  });

  it("valor não reconhecido retorna null", () => {
    expect(mapearStatus("Atrasado")).toBeNull();
  });
});

describe("converterValorImportado (R4)", () => {
  it("valor com duas casas não gera aviso", () => {
    expect(converterValorImportado(54.45, 12)).toEqual({
      centavos: 5445,
      aviso: null,
    });
  });

  it("valor com terceira casa decimal gera aviso de arredondamento", () => {
    const r = converterValorImportado(300.95 / 2, 7);
    expect(r.centavos).toBe(15048);
    expect(r.aviso).toContain("linha 7");
    expect(r.aviso).toContain("arredondado");
  });

  it("valor inteiro vindo de fórmula (2299 - 150) não gera aviso", () => {
    expect(converterValorImportado(2299 - 150, 6)).toEqual({
      centavos: 214900,
      aviso: null,
    });
  });
});

describe("processarLinhaLancamento", () => {
  const buscarContaVazia: BuscarConta = () => null;
  const buscarCategoriaVazia: BuscarCategoria = () => null;

  function deps(overrides: Partial<{
    buscarConta: BuscarConta;
    criarConta: (nome: string) => number;
    buscarCategoria: BuscarCategoria;
    criarCategoria: (nome: string, tipo: "receita" | "despesa", grupo: "necessidade" | "desejo" | "poupanca_divida" | null) => number;
  }> = {}) {
    return {
      buscarConta: overrides.buscarConta ?? buscarContaVazia,
      criarConta: overrides.criarConta ?? vi.fn(() => 1),
      buscarCategoria: overrides.buscarCategoria ?? buscarCategoriaVazia,
      criarCategoria: overrides.criarCategoria ?? vi.fn(() => 1),
    };
  }

  function linhaBase(overrides: Record<string, unknown> = {}) {
    return {
      linha: 6,
      data: new Date(Date.UTC(2026, 8, 5)),
      conta: "Itaú",
      descricao: "Salário",
      categoria: "Salário",
      formaPagamento: "Pix",
      tipo: "Receita",
      valor: 2149,
      status: "Pendente",
      ...overrides,
    };
  }

  it("processa linha válida criando conta e categoria novas", () => {
    const criarConta = vi.fn(() => 10);
    const criarCategoria = vi.fn(() => 20);
    const resultado = processarLinhaLancamento(
      linhaBase(),
      deps({ criarConta, criarCategoria }),
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava sucesso");
    expect(resultado.lancamento).toEqual({
      data: "2026-09-05",
      descricao: "Salário",
      valorCentavos: 214900,
      tipo: "receita",
      categoriaId: 20,
      contaId: 10,
      formaPagamento: "pix",
      status: "pendente",
    });
    expect(criarConta).toHaveBeenCalledWith("Itaú");
    expect(criarCategoria).toHaveBeenCalledWith("Salário", "receita", null);
    expect(resultado.avisos.some((a) => a.includes('conta "Itaú" criada'))).toBe(true);
    expect(
      resultado.avisos.some((a) => a.includes('categoria "Salário" criada')),
    ).toBe(true);
  });

  it("reaproveita conta e categoria existentes sem aviso de criação", () => {
    const buscarConta: BuscarConta = (nome) => (nome === "Nubank" ? 5 : null);
    const buscarCategoria: BuscarCategoria = (nome) =>
      nome === "Saúde" ? { id: 7, tipo: "despesa", grupo: "necessidade" } : null;

    const resultado = processarLinhaLancamento(
      linhaBase({
        conta: "Nubank",
        categoria: "Saúde",
        tipo: "Despesa",
        descricao: "Ju Mansan 3/5",
        valor: 300.95 / 2,
        formaPagamento: "Crédito",
      }),
      deps({ buscarConta, buscarCategoria }),
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava sucesso");
    expect(resultado.lancamento.contaId).toBe(5);
    expect(resultado.lancamento.categoriaId).toBe(7);
    expect(resultado.lancamento.valorCentavos).toBe(15048);
    expect(resultado.avisos.some((a) => a.includes("criada"))).toBe(false);
    expect(resultado.avisos.some((a) => a.includes("arredondado"))).toBe(true);
  });

  it("preserva descrição literal de parcela sem inferir parcelamento (R10)", () => {
    const resultado = processarLinhaLancamento(
      linhaBase({ descricao: "Empréstimo 1/3" }),
      deps(),
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava sucesso");
    expect(resultado.lancamento.descricao).toBe("Empréstimo 1/3");
    expect(resultado.lancamento).not.toHaveProperty("parcelamentoId");
    expect(resultado.lancamento).not.toHaveProperty("numeroParcela");
  });

  it("erro em tipo não reconhecido pula a linha (R6)", () => {
    const resultado = processarLinhaLancamento(
      linhaBase({ tipo: "Transferência" }),
      deps(),
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erro).toContain("tipo");
  });

  it("erro em forma de pagamento não reconhecida pula a linha (R6)", () => {
    const resultado = processarLinhaLancamento(
      linhaBase({ formaPagamento: "Cheque" }),
      deps(),
    );
    expect(resultado.ok).toBe(false);
  });

  it("erro em data inválida pula a linha (R3)", () => {
    const resultado = processarLinhaLancamento(
      linhaBase({ data: "não é uma data" }),
      deps(),
    );
    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erro).toContain("data");
  });

  it("data em texto dd/MM/yyyy gera aviso (R3)", () => {
    const resultado = processarLinhaLancamento(
      linhaBase({ data: "27/09/2026" }),
      deps(),
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("esperava sucesso");
    expect(resultado.lancamento.data).toBe("2026-09-27");
    expect(resultado.avisos.some((a) => a.includes("convertida"))).toBe(true);
  });

  it("tipo incoerente com categoria existente gera erro e pula a linha (R7)", () => {
    const buscarCategoria: BuscarCategoria = (nome) =>
      nome === "Salário" ? { id: 1, tipo: "receita", grupo: null } : null;

    const resultado = processarLinhaLancamento(
      linhaBase({ tipo: "Despesa", categoria: "Salário", valor: 100 }),
      deps({ buscarCategoria }),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("esperava erro");
    expect(resultado.erro).toContain("Salário");
  });
});

describe("processarLinhaDivida (R11)", () => {
  it("cria dívida sem pagamento quando já pago é zero", () => {
    const resultado = processarLinhaDivida(
      { linha: 6, pessoa: "MÃE", valorTotal: 3404.47, jaPago: 0 },
      "2026-09-07",
    );
    expect(resultado).toEqual({
      pessoa: "MÃE",
      valorTotalCentavos: 340447,
      pagamentoInicial: null,
    });
  });

  it("cria pagamento inicial quando já pago é maior que zero", () => {
    const resultado = processarLinhaDivida(
      { linha: 7, pessoa: "MATEUS", valorTotal: 3547.52, jaPago: 500.5 },
      "2026-09-07",
    );
    expect(resultado).toEqual({
      pessoa: "MATEUS",
      valorTotalCentavos: 354752,
      pagamentoInicial: { data: "2026-09-07", valorCentavos: 50050 },
    });
  });

  it("linha sem pessoa é ignorada", () => {
    expect(processarLinhaDivida({ linha: 8, pessoa: "", valorTotal: 0, jaPago: 0 }, "2026-09-07")).toBeNull();
    expect(processarLinhaDivida({ linha: 8, pessoa: null, valorTotal: 0, jaPago: 0 }, "2026-09-07")).toBeNull();
  });
});
