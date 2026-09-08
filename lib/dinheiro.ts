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
export function paraCentavos(valor: number): number {
  if (!Number.isFinite(valor)) {
    throw new Error(`Valor monetário inválido: ${valor}`);
  }

  const s = valor.toFixed(10); // recupera a decimal pretendida
  const negativo = s.startsWith("-");
  const [inteiro, decimais = ""] = (negativo ? s.slice(1) : s).split(".");
  const centavos = Number(decimais.slice(0, 2).padEnd(2, "0"));
  const terceira = Number(decimais[2] ?? "0");
  const total = Number(inteiro) * 100 + centavos + (terceira >= 5 ? 1 : 0);
  return negativo ? -total : total;
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
