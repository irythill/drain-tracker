/**
 * Importa `Lançamentos` e `Dívidas` da planilha `.xlsx` para o banco.
 * Ver `specs/001-importacao-planilha.md`.
 *
 *   pnpm import:xlsx <arquivo.xlsx>            # dry-run (padrão) — R8
 *   pnpm import:xlsx <arquivo.xlsx> --commit   # grava
 *
 * Este arquivo é o único ponto que mistura I/O (planilha, banco) com a
 * orquestração da importação. Toda regra de negócio testável vive em
 * `lib/importacao*.ts` — aqui só resolvemos dependências e gravamos.
 *
 * R9 pede atomicidade via transação única, mas o driver do banco usado pelo
 * resto do app (`drizzle-orm/neon-http`) não suporta `db.transaction()` —
 * decisão registrada em conversa com o usuário: em vez de trocar o driver
 * compartilhado só por causa deste script, fazemos rollback manual
 * compensatório (guarda tudo que foi criado nesta execução e desfaz na
 * ordem inversa se um erro fatal ocorrer).
 */

import "dotenv/config";
import { inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { db as DbClient } from "@/db/client";
import {
  categorias,
  contas,
  dividas,
  importacoes,
  lancamentos,
  pagamentosDivida,
} from "@/db/schema";
import { hojeISO } from "@/lib/data";
import {
  processarLinhaDivida,
  processarLinhaLancamento,
  type BuscarCategoria,
  type BuscarConta,
  type CategoriaExistente,
  type CriarCategoria,
  type CriarConta,
  type GrupoOrcamento,
  type ResultadoLinhaDivida,
  type ResultadoLinhaLancamento,
  type TipoTransacao,
} from "@/lib/importacao";
import { ErroValorFormula, lerLinhasDividas, lerLinhasLancamentos } from "@/lib/importacao-xlsx";
import { formatarRelatorio, montarDadosRelatorio } from "@/lib/importacao-relatorio";

const PRIMEIRA_LINHA_LANCAMENTOS = 6;

/**
 * `db/client.ts` lança na hora do import se `DATABASE_URL` não estiver
 * definida. Importar só depois de validar arquivo/planilha/argumentos evita
 * que um erro de uso simples (esquecer o nome do arquivo) apareça como erro
 * de banco.
 */
type Db = typeof DbClient;

function normalizar(nome: string): string {
  return nome.trim().toLowerCase();
}

function chaveCategoria(nome: string, tipo: TipoTransacao): string {
  return `${normalizar(nome)}::${tipo}`;
}

/**
 * Cache de conta/categoria seedado do banco e atualizado em memória à
 * medida que o processamento das linhas pede criações novas. Mantém
 * `processarLinhaLancamento` inteiramente síncrono — nada aqui grava no
 * banco; a materialização real acontece depois, em lote (`materializar`).
 */
interface PendenteConta {
  nome: string;
  idTemp: number;
}

interface PendenteCategoria {
  nome: string;
  tipo: TipoTransacao;
  grupo: GrupoOrcamento | null;
  idTemp: number;
}

function criarResolvedores() {
  const cacheContas = new Map<string, number>();
  const cacheCategorias = new Map<string, CategoriaExistente>();
  const pendentesContas: PendenteConta[] = [];
  const pendentesCategorias: PendenteCategoria[] = [];
  let proximoIdTemp = -1;

  const buscarConta: BuscarConta = (nome) => cacheContas.get(normalizar(nome)) ?? null;

  const criarConta: CriarConta = (nome) => {
    const id = proximoIdTemp--;
    cacheContas.set(normalizar(nome), id);
    pendentesContas.push({ nome: nome.trim(), idTemp: id });
    return id;
  };

  // Tenta o par exato (nome, tipoLinha) primeiro; só cai para outro tipo do
  // mesmo nome quando não há par exato — ver o comentário de BuscarCategoria.
  const buscarCategoria: BuscarCategoria = (nome, tipoLinha) => {
    const exata = cacheCategorias.get(chaveCategoria(nome, tipoLinha));
    if (exata) return exata;

    const outroTipo: TipoTransacao = tipoLinha === "despesa" ? "receita" : "despesa";
    return cacheCategorias.get(chaveCategoria(nome, outroTipo)) ?? null;
  };

  const criarCategoria: CriarCategoria = (nome, tipo, grupo) => {
    const id = proximoIdTemp--;
    cacheCategorias.set(chaveCategoria(nome, tipo), { id, tipo, grupo });
    pendentesCategorias.push({ nome: nome.trim(), tipo, grupo, idTemp: id });
    return id;
  };

  return {
    buscarConta,
    criarConta,
    buscarCategoria,
    criarCategoria,
    cacheContas,
    cacheCategorias,
    pendentesContas,
    pendentesCategorias,
  };
}

interface IdsCriados {
  contas: number[];
  categorias: number[];
  lancamentos: number[];
  dividas: number[];
  pagamentos: number[];
}

async function desfazer(db: Db, ids: IdsCriados): Promise<void> {
  if (ids.pagamentos.length) {
    await db.delete(pagamentosDivida).where(inArray(pagamentosDivida.id, ids.pagamentos));
  }
  if (ids.dividas.length) {
    await db.delete(dividas).where(inArray(dividas.id, ids.dividas));
  }
  if (ids.lancamentos.length) {
    await db.delete(lancamentos).where(inArray(lancamentos.id, ids.lancamentos));
  }
  if (ids.categorias.length) {
    await db.delete(categorias).where(inArray(categorias.id, ids.categorias));
  }
  if (ids.contas.length) {
    await db.delete(contas).where(inArray(contas.id, ids.contas));
  }
}

/**
 * Grava tudo que a simulação em memória decidiu ser necessário: contas e
 * categorias pendentes primeiro (para trocar id temporário por id real),
 * depois lançamentos, depois dívidas/pagamentos, e por fim o registro de
 * `importacoes` com o relatório — backfilling `importacao_id` (R9).
 */
async function materializar(params: {
  db: Db;
  arquivo: string;
  pendentesContas: PendenteConta[];
  pendentesCategorias: PendenteCategoria[];
  lancamentosOk: Extract<ResultadoLinhaLancamento, { ok: true }>[];
  dividasOk: Extract<ResultadoLinhaDivida, { ok: true }>[];
  dataRelatorio: ReturnType<typeof montarDadosRelatorio>;
}): Promise<void> {
  const { db } = params;
  const ids: IdsCriados = { contas: [], categorias: [], lancamentos: [], dividas: [], pagamentos: [] };

  try {
    const idMapContas = new Map<number, number>();
    if (params.pendentesContas.length > 0) {
      const inseridas = await db
        .insert(contas)
        .values(params.pendentesContas.map((p) => ({ nome: p.nome, tipo: "conta" as const })))
        .returning({ id: contas.id, nome: contas.nome });
      const porNome = new Map(inseridas.map((c) => [normalizar(c.nome), c.id]));
      for (const p of params.pendentesContas) {
        const id = porNome.get(normalizar(p.nome));
        if (id === undefined) throw new Error(`falha ao mapear conta criada: "${p.nome}"`);
        idMapContas.set(p.idTemp, id);
        ids.contas.push(id);
      }
    }

    const idMapCategorias = new Map<number, number>();
    if (params.pendentesCategorias.length > 0) {
      const inseridas = await db
        .insert(categorias)
        .values(params.pendentesCategorias.map((p) => ({ nome: p.nome, tipo: p.tipo, grupo: p.grupo })))
        .returning({ id: categorias.id, nome: categorias.nome, tipo: categorias.tipo });
      const porChave = new Map(inseridas.map((c) => [chaveCategoria(c.nome, c.tipo), c.id]));
      for (const p of params.pendentesCategorias) {
        const id = porChave.get(chaveCategoria(p.nome, p.tipo));
        if (id === undefined) throw new Error(`falha ao mapear categoria criada: "${p.nome}"`);
        idMapCategorias.set(p.idTemp, id);
        ids.categorias.push(id);
      }
    }

    const resolveId = (idTemp: number, mapa: Map<number, number>): number =>
      idTemp < 0 ? mapa.get(idTemp)! : idTemp;

    if (params.lancamentosOk.length > 0) {
      const inseridos = await db
        .insert(lancamentos)
        .values(
          params.lancamentosOk.map((r) => ({
            data: r.lancamento.data,
            descricao: r.lancamento.descricao,
            valorCentavos: r.lancamento.valorCentavos,
            tipo: r.lancamento.tipo,
            categoriaId: resolveId(r.lancamento.categoriaId, idMapCategorias),
            contaId: resolveId(r.lancamento.contaId, idMapContas),
            formaPagamento: r.lancamento.formaPagamento,
            status: r.lancamento.status,
          })),
        )
        .returning({ id: lancamentos.id });
      ids.lancamentos.push(...inseridos.map((l) => l.id));
    }

    for (const r of params.dividasOk) {
      const [dividaInserida] = await db
        .insert(dividas)
        .values({ pessoa: r.divida.pessoa, valorTotalCentavos: r.divida.valorTotalCentavos })
        .returning({ id: dividas.id });
      if (!dividaInserida) throw new Error("insert de dívida não retornou id");
      ids.dividas.push(dividaInserida.id);

      if (r.divida.pagamentoInicial) {
        const [pagamentoInserido] = await db
          .insert(pagamentosDivida)
          .values({
            dividaId: dividaInserida.id,
            data: r.divida.pagamentoInicial.data,
            valorCentavos: r.divida.pagamentoInicial.valorCentavos,
          })
          .returning({ id: pagamentosDivida.id });
        if (!pagamentoInserido) throw new Error("insert de pagamento não retornou id");
        ids.pagamentos.push(pagamentoInserido.id);
      }
    }

    const [importacaoInserida] = await db
      .insert(importacoes)
      .values({
        nomeArquivo: params.arquivo,
        totalCriados: params.dataRelatorio.lancamentos.criados,
        totalIgnorados: params.dataRelatorio.lancamentos.ignorados,
        relatorio: params.dataRelatorio,
      })
      .returning({ id: importacoes.id });
    if (!importacaoInserida) throw new Error("insert de importação não retornou id");

    if (ids.lancamentos.length > 0) {
      await db
        .update(lancamentos)
        .set({ importacaoId: importacaoInserida.id })
        .where(inArray(lancamentos.id, ids.lancamentos));
    }
  } catch (erro) {
    console.error("Erro fatal durante a gravação:", erro);
    console.error("Desfazendo tudo que esta execução criou...");
    try {
      await desfazer(db, ids);
    } catch (erroDesfazer) {
      throw new Error(
        "Rollback falhou depois de um erro de gravação — o banco pode ter ficado " +
          "com registros parciais desta execução. Verifique manualmente.",
        { cause: { erroOriginal: erro, erroDesfazer } },
      );
    }
    throw erro;
  }
}

async function main(): Promise<void> {
  const [arquivo, ...resto] = process.argv.slice(2);
  const commit = resto.includes("--commit");

  if (!arquivo) {
    console.error("Uso: pnpm import:xlsx <arquivo.xlsx> [--commit]");
    process.exitCode = 1;
    return;
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(arquivo);
  } catch {
    console.error(`Não foi possível abrir "${arquivo}".`);
    process.exitCode = 1;
    return;
  }

  const wsLancamentos = workbook.getWorksheet("Lançamentos");
  const wsDividas = workbook.getWorksheet("Dívidas");
  if (!wsLancamentos || !wsDividas) {
    console.error('A planilha precisa ter as abas "Lançamentos" e "Dívidas".');
    process.exitCode = 1;
    return;
  }

  let linhasLancamentos, linhasDividas;
  try {
    linhasLancamentos = lerLinhasLancamentos(wsLancamentos, PRIMEIRA_LINHA_LANCAMENTOS);
    linhasDividas = lerLinhasDividas(wsDividas);
  } catch (erro) {
    if (erro instanceof ErroValorFormula) {
      console.error(`Importação abortada: ${erro.message}`);
      process.exitCode = 1;
      return;
    }
    throw erro;
  }

  const totalVarridas = Math.max(0, wsLancamentos.rowCount - PRIMEIRA_LINHA_LANCAMENTOS + 1);
  const ignoradas = totalVarridas - linhasLancamentos.length;

  const { db } = await import("@/db/client");

  const contasExistentes = await db.select().from(contas);
  const categoriasExistentes = await db.select().from(categorias);

  // A UNIQUE do banco é na string exata; nomes que só diferem em caixa ou
  // espaço nas pontas colidem só depois de normalizados. Se isso acontecer
  // (dado sujo anterior a este script), abortar é mais seguro que decidir
  // silenciosamente qual das duas contas/categorias existentes "vence".
  const resolvedores = criarResolvedores();
  for (const c of contasExistentes) {
    const chave = normalizar(c.nome);
    if (resolvedores.cacheContas.has(chave)) {
      throw new Error(
        `Duas contas no banco só diferem em caixa/espaço: "${c.nome}" colide ` +
          `com outra já vista como "${chave}". Corrija os dados antes de importar.`,
      );
    }
    resolvedores.cacheContas.set(chave, c.id);
  }
  for (const c of categoriasExistentes) {
    const chave = chaveCategoria(c.nome, c.tipo);
    if (resolvedores.cacheCategorias.has(chave)) {
      throw new Error(
        `Duas categorias do mesmo tipo no banco só diferem em caixa/espaço: ` +
          `"${c.nome}" (${c.tipo}) colide com outra já vista. Corrija os dados antes de importar.`,
      );
    }
    resolvedores.cacheCategorias.set(chave, { id: c.id, tipo: c.tipo, grupo: c.grupo });
  }

  // Processamento é 100% síncrono e em memória — commit e dry-run seguem
  // exatamente o mesmo caminho até aqui, o que garante R8 (relatório
  // idêntico nos dois modos).
  const resultadosLancamentos: ResultadoLinhaLancamento[] = linhasLancamentos.map((bruta) =>
    processarLinhaLancamento(bruta, resolvedores),
  );
  const dataImportacao = hojeISO();
  const resultadosDividas: (ResultadoLinhaDivida | null)[] = linhasDividas.map((bruta) =>
    processarLinhaDivida(bruta, dataImportacao),
  );

  const dataRelatorio = montarDadosRelatorio({
    arquivo,
    modo: commit ? "COMMIT" : "DRY-RUN",
    ignoradas,
    resultadosLancamentos,
    resultadosDividas,
  });

  if (commit) {
    const lancamentosOk = resultadosLancamentos.filter(
      (r): r is Extract<ResultadoLinhaLancamento, { ok: true }> => r.ok,
    );
    const dividasOk = resultadosDividas.filter(
      (r): r is Extract<ResultadoLinhaDivida, { ok: true }> => r !== null && r.ok,
    );

    try {
      await materializar({
        db,
        arquivo,
        pendentesContas: resolvedores.pendentesContas,
        pendentesCategorias: resolvedores.pendentesCategorias,
        lancamentosOk,
        dividasOk,
        dataRelatorio,
      });
    } catch (erro) {
      // Não imprime formatarRelatorio(dataRelatorio) aqui: aqueles números
      // (criados, dívidas, [COMMIT]) descrevem o que a simulação em memória
      // decidiu, não o que sobrou no banco depois do rollback — imprimir
      // como se fosse o relatório normal mentiria sobre o que foi persistido.
      console.error(
        `Importação para "${arquivo}" FALHOU e foi desfeita — nada ficou gravado.`,
      );
      console.error(erro);
      process.exitCode = 1;
      return;
    }
  }

  console.log(formatarRelatorio(dataRelatorio));
}

main().catch((erro) => {
  console.error("Importação falhou:", erro);
  process.exitCode = 1;
});
