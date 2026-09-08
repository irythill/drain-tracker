/**
 * Regras de transformação da importação da planilha.
 * Ver `specs/001-importacao-planilha.md`.
 *
 * Módulo puro: nenhuma função aqui toca banco ou arquivo. Resolução de
 * conta/categoria é injetada via `buscar*`/`criar*` para manter a lógica de
 * negócio testável sem Postgres.
 */

import { parseDataPlanilha, type DataISO } from "@/lib/data";
import { formatarBRL, houveArredondamento, paraCentavos } from "@/lib/dinheiro";

export type TipoTransacao = "receita" | "despesa";
export type FormaPagamentoImportada =
  | "debito"
  | "credito"
  | "pix"
  | "dinheiro"
  | "boleto";
export type StatusImportado = "pago" | "pendente";
export type GrupoOrcamento = "necessidade" | "desejo" | "poupanca_divida";

/** Categoria criada automaticamente recebe `desejo` como grupo padrão (R5). */
export function grupoPadraoParaTipo(tipo: TipoTransacao): GrupoOrcamento | null {
  return tipo === "despesa" ? "desejo" : null;
}

function normalizarComparacao(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Uma linha só é dado se data e valor estiverem preenchidos (R1). */
export function linhaTemDado(data: unknown, valor: unknown): boolean {
  const preenchida = (v: unknown) => v !== null && v !== undefined && v !== "";
  return preenchida(data) && preenchida(valor);
}

const MAPA_TIPO: Record<string, TipoTransacao> = {
  receita: "receita",
  despesa: "despesa",
};

/** Mapeia `Receita`/`Despesa` sem acento e sem caixa (R6). */
export function mapearTipoTransacao(valor: unknown): TipoTransacao | null {
  return MAPA_TIPO[normalizarComparacao(valor)] ?? null;
}

const MAPA_FORMA_PAGAMENTO: Record<string, FormaPagamentoImportada> = {
  debito: "debito",
  credito: "credito",
  pix: "pix",
  dinheiro: "dinheiro",
  boleto: "boleto",
};

/** Mapeia forma de pagamento sem acento e sem caixa (R6). */
export function mapearFormaPagamento(valor: unknown): FormaPagamentoImportada | null {
  return MAPA_FORMA_PAGAMENTO[normalizarComparacao(valor)] ?? null;
}

const MAPA_STATUS: Record<string, StatusImportado> = {
  pago: "pago",
  pendente: "pendente",
};

/** Mapeia `Pago`/`Pendente` sem acento e sem caixa (R6). */
export function mapearStatus(valor: unknown): StatusImportado | null {
  return MAPA_STATUS[normalizarComparacao(valor)] ?? null;
}

export type ConversaoValor = { centavos: number; aviso: string | null };

/**
 * Converte o valor da planilha para centavos e registra aviso quando a
 * terceira casa decimal força arredondamento (R4).
 */
export function converterValorImportado(valor: number, linha: number): ConversaoValor {
  const centavos = paraCentavos(valor);

  if (!houveArredondamento(valor)) {
    return { centavos, aviso: null };
  }

  return {
    centavos,
    aviso: `linha ${linha}  valor ${valor} arredondado para ${formatarBRL(centavos)}`,
  };
}

export interface CategoriaExistente {
  id: number;
  tipo: TipoTransacao;
  grupo: GrupoOrcamento | null;
}

export type BuscarConta = (nome: string) => number | null;
export type CriarConta = (nome: string) => number;
/**
 * Busca a categoria relevante para esta linha. O nome sozinho não é chave
 * única — o schema permite "Outros" tanto em despesa quanto em receita
 * (`specs/data-model.md`) — então quem implementa deve tentar o par exato
 * (nome, tipoLinha) primeiro e só cair para outro tipo do mesmo nome depois
 * — que é o caso que R7 quer pegar como incoerência.
 */
export type BuscarCategoria = (
  nome: string,
  tipoLinha: TipoTransacao,
) => CategoriaExistente | null;
export type CriarCategoria = (
  nome: string,
  tipo: TipoTransacao,
  grupo: GrupoOrcamento | null,
) => number;

export interface DependenciasResolucao {
  buscarConta: BuscarConta;
  criarConta: CriarConta;
  buscarCategoria: BuscarCategoria;
  criarCategoria: CriarCategoria;
}

export interface LinhaLancamentoBruta {
  linha: number;
  data: unknown;
  conta: unknown;
  descricao: unknown;
  categoria: unknown;
  formaPagamento: unknown;
  tipo: unknown;
  valor: unknown;
  status: unknown;
}

export interface LancamentoImportado {
  data: DataISO;
  descricao: string;
  valorCentavos: number;
  tipo: TipoTransacao;
  categoriaId: number;
  contaId: number;
  formaPagamento: FormaPagamentoImportada;
  status: StatusImportado;
}

export type ResultadoLinhaLancamento =
  | { ok: true; linha: number; lancamento: LancamentoImportado; avisos: string[] }
  | { ok: false; linha: number; erro: string };

/** Resolve conta pelo nome, criando quando não existe (R5). */
function resolverConta(
  nome: string,
  linha: number,
  deps: Pick<DependenciasResolucao, "buscarConta" | "criarConta">,
): { id: number; aviso: string | null } {
  const existente = deps.buscarConta(nome);
  if (existente !== null) {
    return { id: existente, aviso: null };
  }
  const id = deps.criarConta(nome);
  return { id, aviso: `linha ${linha}  conta "${nome}" criada` };
}

/**
 * Busca categoria pelo nome e checa coerência de tipo (R7). Não cria nada —
 * é seguro chamar antes de saber se a linha inteira vai ser aceita.
 */
function buscarCategoriaCoerente(
  nome: string,
  tipoLinha: TipoTransacao,
  deps: Pick<DependenciasResolucao, "buscarCategoria">,
): { existente: CategoriaExistente | null } | { erro: string } {
  const existente = deps.buscarCategoria(nome, tipoLinha);
  if (existente !== null && existente.tipo !== tipoLinha) {
    return {
      erro: `categoria "${nome}" é do tipo "${existente.tipo}", linha é "${tipoLinha}"`,
    };
  }
  return { existente };
}

/**
 * Obtém a categoria já resolvida por `buscarCategoriaCoerente`, criando-a
 * quando não existe (R5). Só deve ser chamada depois que a linha inteira já
 * foi validada — é o único ponto que pode gravar no banco.
 */
function obterOuCriarCategoria(
  nome: string,
  tipoLinha: TipoTransacao,
  existente: CategoriaExistente | null,
  linha: number,
  deps: Pick<DependenciasResolucao, "criarCategoria">,
): { id: number; grupo: GrupoOrcamento | null; aviso: string | null } {
  if (existente !== null) {
    return { id: existente.id, grupo: existente.grupo, aviso: null };
  }

  const grupo = grupoPadraoParaTipo(tipoLinha);
  const id = deps.criarCategoria(nome, tipoLinha, grupo);
  const aviso =
    tipoLinha === "despesa"
      ? `linha ${linha}  categoria "${nome}" criada com grupo "${grupo}" — revisar`
      : `linha ${linha}  categoria "${nome}" criada`;
  return { id, grupo, aviso };
}

/** Processa uma linha da aba Lançamentos aplicando R1–R7 e R10. */
export function processarLinhaLancamento(
  bruta: LinhaLancamentoBruta,
  deps: DependenciasResolucao,
): ResultadoLinhaLancamento {
  const { linha } = bruta;
  const avisos: string[] = [];

  const tipo = mapearTipoTransacao(bruta.tipo);
  if (!tipo) {
    return { ok: false, linha, erro: `tipo não reconhecido: "${String(bruta.tipo)}"` };
  }

  const formaPagamento = mapearFormaPagamento(bruta.formaPagamento);
  if (!formaPagamento) {
    return {
      ok: false,
      linha,
      erro: `forma de pagamento não reconhecida: "${String(bruta.formaPagamento)}"`,
    };
  }

  const status = mapearStatus(bruta.status);
  if (!status) {
    return { ok: false, linha, erro: `status não reconhecido: "${String(bruta.status)}"` };
  }

  const leituraData = parseDataPlanilha(bruta.data);
  if (leituraData.data === null) {
    return { ok: false, linha, erro: leituraData.erro };
  }
  if (leituraData.aviso) {
    avisos.push(`linha ${linha}  ${leituraData.aviso}`);
  }

  const valorNumerico = typeof bruta.valor === "number" ? bruta.valor : Number(bruta.valor);
  if (!Number.isFinite(valorNumerico)) {
    return { ok: false, linha, erro: `valor inválido: "${String(bruta.valor)}"` };
  }
  const { centavos, aviso: avisoValor } = converterValorImportado(valorNumerico, linha);
  if (avisoValor) avisos.push(avisoValor);

  const nomeConta = String(bruta.conta ?? "").trim();
  if (!nomeConta) {
    return { ok: false, linha, erro: "conta vazia" };
  }

  const nomeCategoria = String(bruta.categoria ?? "").trim();
  if (!nomeCategoria) {
    return { ok: false, linha, erro: "categoria vazia" };
  }
  const categoriaBuscada = buscarCategoriaCoerente(nomeCategoria, tipo, deps);
  if ("erro" in categoriaBuscada) {
    return { ok: false, linha, erro: categoriaBuscada.erro };
  }

  const descricao = String(bruta.descricao ?? "").trim();
  if (!descricao) {
    return { ok: false, linha, erro: "descrição vazia" };
  }

  // A partir daqui a linha está garantidamente aceita — só agora é seguro
  // criar conta/categoria novas (efeito colateral no banco em --commit).
  const conta = resolverConta(nomeConta, linha, deps);
  if (conta.aviso) avisos.push(conta.aviso);

  const categoria = obterOuCriarCategoria(
    nomeCategoria,
    tipo,
    categoriaBuscada.existente,
    linha,
    deps,
  );
  if (categoria.aviso) avisos.push(categoria.aviso);

  return {
    ok: true,
    linha,
    avisos,
    lancamento: {
      data: leituraData.data,
      descricao,
      valorCentavos: centavos,
      tipo,
      categoriaId: categoria.id,
      contaId: conta.id,
      formaPagamento,
      status,
    },
  };
}

export interface LinhaDividaBruta {
  linha: number;
  pessoa: unknown;
  valorTotal: number;
  jaPago: number;
}

export interface DividaImportada {
  pessoa: string;
  valorTotalCentavos: number;
  pagamentoInicial: { data: DataISO; valorCentavos: number } | null;
}

export type ResultadoLinhaDivida =
  | { ok: true; divida: DividaImportada }
  | { ok: false; linha: number; erro: string };

/**
 * Processa uma linha da aba Dívidas (R11). Retorna `null` quando a linha
 * não tem pessoa preenchida — nesse caso ela é ignorada, não é erro.
 *
 * Valores não numéricos em "valor total" ou "já pago" viram erro explícito,
 * não são silenciosamente tratados como zero: `Number("-") > 0` é `false`,
 * e trocar isso por um `NaN` sem aviso apagaria um pagamento real em
 * silêncio (a mesma classe de bug que perdeu R$ 406,28 na planilha original).
 */
export function processarLinhaDivida(
  bruta: LinhaDividaBruta,
  dataImportacao: DataISO,
): ResultadoLinhaDivida | null {
  const pessoa = String(bruta.pessoa ?? "").trim();
  if (!pessoa) return null;

  if (!Number.isFinite(bruta.valorTotal)) {
    return {
      ok: false,
      linha: bruta.linha,
      erro: `valor total da dívida inválido: "${bruta.valorTotal}"`,
    };
  }
  if (!Number.isFinite(bruta.jaPago)) {
    return {
      ok: false,
      linha: bruta.linha,
      erro: `valor "já pago" inválido: "${bruta.jaPago}"`,
    };
  }

  return {
    ok: true,
    divida: {
      pessoa,
      valorTotalCentavos: paraCentavos(bruta.valorTotal),
      pagamentoInicial:
        bruta.jaPago > 0
          ? { data: dataImportacao, valorCentavos: paraCentavos(bruta.jaPago) }
          : null,
    },
  };
}
