/**
 * Data de domínio é dia civil: sem hora e sem timezone, sempre "YYYY-MM-DD".
 * Ver `specs/dominio-financeiro.md` §2.
 *
 * Nada aqui usa `new Date()` para representar data de domínio — ele arrasta
 * timezone e desloca o dia. A aritmética é feita sobre os componentes.
 */

/** Data civil no formato "YYYY-MM-DD". */
export type DataISO = string;

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último dia do mês pedido.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function componentes(data: DataISO): [number, number, number] | null {
  const m = FORMATO_ISO.exec(data);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);

  if (mes < 1 || mes > 12) return null;
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null;

  return [ano, mes, dia];
}

function monta(ano: number, mes: number, dia: number): DataISO {
  return [
    String(ano).padStart(4, "0"),
    String(mes).padStart(2, "0"),
    String(dia).padStart(2, "0"),
  ].join("-");
}

/** Verdadeiro só para uma data civil existente em "YYYY-MM-DD". */
export function ehDataISO(valor: unknown): valor is DataISO {
  return typeof valor === "string" && componentes(valor) !== null;
}

function exigeDataISO(data: DataISO): [number, number, number] {
  const c = componentes(data);
  if (!c) throw new Error(`Data inválida, esperado YYYY-MM-DD: "${data}"`);
  return c;
}

/**
 * Soma meses saturando no último dia do mês de destino:
 * `2026-01-31` + 1 mês → `2026-02-28`.
 *
 * A parcela `n` é sempre calculada a partir da data da **primeira** parcela,
 * nunca da anterior — somar 1 mês doze vezes não é somar 12 meses (§2.1).
 */
export function adicionaMeses(data: DataISO, meses: number): DataISO {
  const [ano, mes, dia] = exigeDataISO(data);

  if (!Number.isInteger(meses)) {
    throw new Error(`Número de meses deve ser inteiro: ${meses}`);
  }

  const totalMeses = ano * 12 + (mes - 1) + meses;
  const anoDestino = Math.floor(totalMeses / 12);
  const mesDestino = (totalMeses % 12) + 1;

  return monta(anoDestino, mesDestino, Math.min(dia, diasNoMes(anoDestino, mesDestino)));
}

/** Primeiro dia do mês. */
export function inicioDoMes(ano: number, mes: number): DataISO {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mês fora da faixa 1..12: ${mes}`);
  }
  return monta(ano, mes, 1);
}

/** Último dia do mês. */
export function fimDoMes(ano: number, mes: number): DataISO {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Mês fora da faixa 1..12: ${mes}`);
  }
  return monta(ano, mes, diasNoMes(ano, mes));
}

/**
 * Converte texto em `dd/MM/yyyy` para data civil.
 *
 * O formato é sempre brasileiro: `03/04/2026` é 3 de abril. Devolve `null`
 * quando não é possível converter — parsing frouxo é bug, não conveniência.
 */
export function parseDataBR(valor: string): DataISO | null {
  const m = FORMATO_BR.exec(valor.trim());
  if (!m) return null;

  const candidata = monta(Number(m[3]), Number(m[2]), Number(m[1]));
  return ehDataISO(candidata) ? candidata : null;
}

/** Resultado da leitura de uma célula de data da planilha. */
export type LeituraData =
  | { data: DataISO; aviso: string | null; erro?: undefined }
  | { data: null; aviso?: undefined; erro: string };

/**
 * Lê uma célula de data da planilha (R3 da spec 001).
 *
 * Data nativa é usada direto. Texto em `dd/MM/yyyy` ou já em ISO é convertido
 * e gera aviso. O que não converte vira erro — a linha é pulada, a execução
 * segue.
 */
export function parseDataPlanilha(valor: unknown): LeituraData {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      return { data: null, erro: "data nativa inválida" };
    }
    // ExcelJS entrega data sem hora como meia-noite UTC; ler em UTC evita
    // que o fuso local puxe o dia para trás.
    return {
      data: monta(
        valor.getUTCFullYear(),
        valor.getUTCMonth() + 1,
        valor.getUTCDate(),
      ),
      aviso: null,
    };
  }

  if (typeof valor === "string") {
    const texto = valor.trim();
    if (texto === "") return { data: null, erro: "data vazia" };

    const convertida = parseDataBR(texto) ?? (ehDataISO(texto) ? texto : null);
    if (convertida) {
      return { data: convertida, aviso: `data em texto "${texto}" convertida` };
    }
    return { data: null, erro: `data não reconhecida: "${texto}"` };
  }

  if (valor === null || valor === undefined) {
    return { data: null, erro: "data vazia" };
  }

  return { data: null, erro: `data não reconhecida: "${String(valor)}"` };
}
