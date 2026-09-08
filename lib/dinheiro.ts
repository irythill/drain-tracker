/**
 * Dinheiro é sempre `integer` em centavos de BRL.
 * Ver `specs/dominio-financeiro.md` §1.
 */

/**
 * Único ponto do sistema onde decimal vira centavos.
 *
 * `Math.round(valor * 100)` é proibido: em ponto flutuante
 * `1.005 * 100 = 100.49999999999999`, e o arredondamento cai para baixo em
 * silêncio. A conversão passa pela representação decimal em string.
 *
 * A terceira casa decimal `>= 5` arredonda para cima.
 */
/** Casas decimais de `|valor|`, recuperadas via string para fugir do float. */
function casasDecimais(valor: number): string {
  const [, decimais = ""] = Math.abs(valor).toFixed(10).split(".");
  return decimais;
}

export function paraCentavos(valor: number): number {
  if (!Number.isFinite(valor)) {
    throw new Error(`Valor monetário inválido: ${valor}`);
  }

  const negativo = valor < 0;
  const decimais = casasDecimais(valor);
  const inteiro = Math.trunc(Math.abs(valor));
  const centavos = Number(decimais.slice(0, 2).padEnd(2, "0"));
  const terceira = Number(decimais[2] ?? "0");
  const total = inteiro * 100 + centavos + (terceira >= 5 ? 1 : 0);
  return negativo ? -total : total;
}

/**
 * Verdadeiro quando `valor` tem alguma casa decimal além da segunda —
 * ou seja, quando `paraCentavos` precisou descartar ou arredondar dígitos.
 * Usado pelo importador (R4) para decidir quando emitir aviso.
 */
export function houveArredondamento(valor: number): boolean {
  return casasDecimais(valor).slice(2).replace(/0+$/, "").length > 0;
}

/**
 * Divide um total em `n` partes distribuindo o resto em centavos.
 *
 * As primeiras `resto` partes recebem um centavo a mais. A soma das partes é
 * sempre exatamente igual ao total — é a única forma permitida de dividir
 * dinheiro no sistema (§1.4).
 */
export function dividirCentavos(total: number, n: number): number[] {
  if (!Number.isInteger(total)) {
    throw new Error(`Total deve ser inteiro em centavos, recebido: ${total}`);
  }
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Número de partes deve ser inteiro >= 1, recebido: ${n}`);
  }

  const base = Math.floor(total / n);
  const resto = total - base * n;

  return Array.from({ length: n }, (_, i) => (i < resto ? base + 1 : base));
}

const formatadorBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Formatação só na borda de exibição. O resultado nunca é persistido,
 * comparado ou somado (§1.3).
 */
export function formatarBRL(centavos: number): string {
  return formatadorBRL.format(centavos / 100);
}
