import { describe, expect, it } from "vitest";
import { POSTGRES_INT_MAX, idLancamentoSchema, lancamentoSchema } from "@/lib/lancamento-schema";

const valido = {
  data: "2026-03-15",
  descricao: "Mercado",
  valorCentavos: 15048,
  tipo: "despesa" as const,
  categoriaId: 1,
  contaId: 1,
  formaPagamento: "pix" as const,
  status: "pendente" as const,
};

describe("lancamentoSchema", () => {
  it("aceita um lançamento válido", () => {
    expect(lancamentoSchema.safeParse(valido).success).toBe(true);
  });

  it("aceita observação omitida ou vazia", () => {
    expect(lancamentoSchema.safeParse(valido).success).toBe(true);
    expect(lancamentoSchema.safeParse({ ...valido, observacao: "" }).success).toBe(true);
  });

  it.each(["2026-13-01", "2026-02-30", "31/03/2026", "não é data", "", "2026-3-5"])(
    "rejeita data inválida: %s",
    (data) => {
      expect(lancamentoSchema.safeParse({ ...valido, data }).success).toBe(false);
    },
  );

  it.each([0, -100, 150.5])("rejeita valorCentavos inválido: %s", (valorCentavos) => {
    expect(lancamentoSchema.safeParse({ ...valido, valorCentavos }).success).toBe(false);
  });

  it("rejeita descrição vazia ou só espaços", () => {
    expect(lancamentoSchema.safeParse({ ...valido, descricao: "" }).success).toBe(false);
    expect(lancamentoSchema.safeParse({ ...valido, descricao: "   " }).success).toBe(false);
  });

  it("rejeita tipo, forma de pagamento e status fora do enum", () => {
    expect(lancamentoSchema.safeParse({ ...valido, tipo: "invalido" }).success).toBe(false);
    expect(
      lancamentoSchema.safeParse({ ...valido, formaPagamento: "invalido" }).success,
    ).toBe(false);
    expect(lancamentoSchema.safeParse({ ...valido, status: "invalido" }).success).toBe(false);
  });

  it.each([0, -1, 1.5])("rejeita categoriaId e contaId inválidos: %s", (id) => {
    expect(lancamentoSchema.safeParse({ ...valido, categoriaId: id }).success).toBe(false);
    expect(lancamentoSchema.safeParse({ ...valido, contaId: id }).success).toBe(false);
  });

  it("aceita valorCentavos no teto do integer do Postgres", () => {
    expect(lancamentoSchema.safeParse({ ...valido, valorCentavos: POSTGRES_INT_MAX }).success).toBe(
      true,
    );
  });

  it("rejeita valorCentavos acima do teto do integer do Postgres", () => {
    expect(
      lancamentoSchema.safeParse({ ...valido, valorCentavos: POSTGRES_INT_MAX + 1 }).success,
    ).toBe(false);
  });

  it("rejeita categoriaId e contaId acima do teto do integer do Postgres", () => {
    expect(
      lancamentoSchema.safeParse({ ...valido, categoriaId: POSTGRES_INT_MAX + 1 }).success,
    ).toBe(false);
    expect(
      lancamentoSchema.safeParse({ ...valido, contaId: POSTGRES_INT_MAX + 1 }).success,
    ).toBe(false);
  });
});

describe("idLancamentoSchema", () => {
  it("aceita um inteiro positivo dentro do teto", () => {
    expect(idLancamentoSchema.safeParse(1).success).toBe(true);
    expect(idLancamentoSchema.safeParse(POSTGRES_INT_MAX).success).toBe(true);
  });

  it.each([0, -1, 1.5, POSTGRES_INT_MAX + 1, Number.NaN])("rejeita id inválido: %s", (id) => {
    expect(idLancamentoSchema.safeParse(id).success).toBe(false);
  });
});
