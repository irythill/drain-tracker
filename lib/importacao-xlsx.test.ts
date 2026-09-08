import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  ErroValorFormula,
  lerLinhasDividas,
  lerLinhasLancamentos,
} from "@/lib/importacao-xlsx";

/**
 * Monta uma planilha sintética no formato da aba `Lançamentos`: cabeçalho na
 * linha 5, dados a partir da linha 6 (ver spec 001).
 */
function planilhaLancamentos(): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lançamentos");
  ws.getRow(5).values = [
    ,
    ,
    "Data",
    "Conta",
    "Descrição",
    "Categoria",
    "Grupo (auto)",
    "Forma de Pagamento",
    "Tipo",
    "Valor",
    "Status",
  ];
  return ws;
}

function celula(ws: ExcelJS.Worksheet, linha: number, coluna: number, valor: unknown) {
  ws.getRow(linha).getCell(coluna).value = valor as ExcelJS.CellValue;
}

describe("lerLinhasLancamentos", () => {
  it("lê linha com valor de fórmula em cache (R2)", () => {
    const ws = planilhaLancamentos();
    celula(ws, 6, 2, new Date(Date.UTC(2026, 8, 5)));
    celula(ws, 6, 3, "Itaú");
    celula(ws, 6, 4, "Salário");
    celula(ws, 6, 5, "Salário");
    celula(ws, 6, 7, "Pix");
    celula(ws, 6, 8, "Receita");
    celula(ws, 6, 9, { formula: "2299 - 150", result: 2149 });
    celula(ws, 6, 10, "Pendente");

    const linhas = lerLinhasLancamentos(ws);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ linha: 6, valor: 2149, conta: "Itaú" });
  });

  it("aborta com erro quando fórmula não tem valor calculado em cache (R2)", () => {
    const ws = planilhaLancamentos();
    celula(ws, 6, 2, new Date(Date.UTC(2026, 8, 5)));
    celula(ws, 6, 9, { formula: "300.95 / 2" }); // sem `result`

    expect(() => lerLinhasLancamentos(ws)).toThrow(ErroValorFormula);
  });

  it("ignora linha sem data e valor, mesmo com fórmula vazia nas colunas auxiliares (R1)", () => {
    const ws = planilhaLancamentos();
    // Linha "fantasma": só a coluna de fórmula auxiliar (F) tem algo.
    celula(ws, 6, 6, { formula: 'IF(TRUE,"","")', result: "" });
    // Linha real logo depois.
    celula(ws, 7, 2, new Date(Date.UTC(2026, 8, 6)));
    celula(ws, 7, 3, "Nubank");
    celula(ws, 7, 4, "McDonalds");
    celula(ws, 7, 5, "Alimentação");
    celula(ws, 7, 7, "Crédito");
    celula(ws, 7, 8, "Despesa");
    celula(ws, 7, 9, 54.45);
    celula(ws, 7, 10, "Pendente");

    const linhas = lerLinhasLancamentos(ws);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.linha).toBe(7);
  });

  it("passa data em texto adiante sem interpretar (fica a cargo do domínio) (R3)", () => {
    const ws = planilhaLancamentos();
    celula(ws, 6, 2, "21/09/2026");
    celula(ws, 6, 9, 100);

    const linhas = lerLinhasLancamentos(ws);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.data).toBe("21/09/2026");
  });

  it("percorre até o fim real da planilha, não um limite fixo", () => {
    const ws = planilhaLancamentos();
    celula(ws, 6, 2, new Date(Date.UTC(2026, 8, 5)));
    celula(ws, 6, 9, 100);
    // Linha bem depois, simulando as fórmulas vazias até a linha 988 do arquivo real.
    celula(ws, 40, 2, new Date(Date.UTC(2026, 8, 30)));
    celula(ws, 40, 9, 200);

    const linhas = lerLinhasLancamentos(ws);
    expect(linhas.map((l) => l.linha)).toEqual([6, 40]);
  });
});

describe("lerLinhasDividas", () => {
  function planilhaDividas(): ExcelJS.Worksheet {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Dívidas");
    ws.getRow(5).values = [
      ,
      ,
      "A quem devo",
      "Valor Total",
      "Já Pago",
      "Saldo Devedor",
      "% Quitado",
      "Status",
    ];
    return ws;
  }

  it("lê apenas linhas com pessoa preenchida, resolvendo fórmulas", () => {
    const ws = planilhaDividas();
    celula(ws, 6, 2, "MÃE");
    celula(ws, 6, 3, { formula: "2528.86 + 875.61", result: 3404.47 });
    celula(ws, 6, 4, 0);
    celula(ws, 7, 2, "MATEUS");
    celula(ws, 7, 3, 3547.52);
    celula(ws, 7, 4, 0);
    // Linhas 8-15 ficam vazias (só fórmulas de saldo/status, sem pessoa).
    celula(ws, 8, 5, { formula: "IF($B8=\"\",\"\",C8-D8)", result: "" });

    const linhas = lerLinhasDividas(ws);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ pessoa: "MÃE", valorTotal: 3404.47, jaPago: 0 });
    expect(linhas[1]).toMatchObject({ pessoa: "MATEUS", valorTotal: 3547.52 });
  });

  it("célula 'já pago' vazia vira zero, mas texto solto vira NaN (não fica em silêncio)", () => {
    const ws = planilhaDividas();
    celula(ws, 6, 2, "MÃE");
    celula(ws, 6, 3, 100);
    // coluna "já pago" em branco
    celula(ws, 7, 2, "MATEUS");
    celula(ws, 7, 3, 100);
    celula(ws, 7, 4, "-"); // placeholder não numérico, não deve virar 0 silenciosamente

    const linhas = lerLinhasDividas(ws);
    expect(linhas[0]).toMatchObject({ pessoa: "MÃE", jaPago: 0 });
    expect(linhas[1]!.jaPago).toBeNaN();
  });
});
