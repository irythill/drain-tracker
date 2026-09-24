"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { categorias, contas, lancamentos } from "@/db/schema";
import { exigirSessao } from "@/lib/sessao-servidor";
import {
  idLancamentoSchema,
  lancamentoSchema,
  type LancamentoInput,
} from "@/lib/lancamento-schema";

export type ResultadoLancamento = {
  campos?: Partial<Record<keyof LancamentoInput, string>>;
  /** Erro que não pertence a um campo específico do formulário. */
  erro?: string;
};

function mapearErrosZod(erro: z.ZodError): Partial<Record<keyof LancamentoInput, string>> {
  const campos: Partial<Record<keyof LancamentoInput, string>> = {};
  for (const issue of erro.issues) {
    const campo = issue.path[0];
    if (typeof campo === "string" && !(campo in campos)) {
      campos[campo as keyof LancamentoInput] = issue.message;
    }
  }
  return campos;
}

async function validarCategoriaEConta(
  dados: LancamentoInput,
): Promise<ResultadoLancamento | null> {
  const categoria = await db.query.categorias.findFirst({
    where: eq(categorias.id, dados.categoriaId),
  });
  if (!categoria || categoria.arquivada) {
    return { campos: { categoriaId: "Categoria inválida ou arquivada" } };
  }
  if (categoria.tipo !== dados.tipo) {
    return { campos: { categoriaId: "Categoria não corresponde ao tipo do lançamento" } };
  }

  const conta = await db.query.contas.findFirst({
    where: eq(contas.id, dados.contaId),
  });
  if (!conta || conta.arquivada) {
    return { campos: { contaId: "Conta inválida ou arquivada" } };
  }

  return null;
}

export async function criarLancamento(dadosBrutos: unknown): Promise<ResultadoLancamento> {
  await exigirSessao();

  const dados = lancamentoSchema.safeParse(dadosBrutos);
  if (!dados.success) {
    return { campos: mapearErrosZod(dados.error) };
  }

  const erro = await validarCategoriaEConta(dados.data);
  if (erro) return erro;

  await db.insert(lancamentos).values({
    data: dados.data.data,
    descricao: dados.data.descricao,
    valorCentavos: dados.data.valorCentavos,
    tipo: dados.data.tipo,
    categoriaId: dados.data.categoriaId,
    contaId: dados.data.contaId,
    formaPagamento: dados.data.formaPagamento,
    status: dados.data.status,
    observacao: dados.data.observacao ?? null,
  });

  revalidatePath("/lancamentos");
  return {};
}

export async function editarLancamento(
  idBruto: number,
  dadosBrutos: unknown,
): Promise<ResultadoLancamento> {
  await exigirSessao();

  const id = idLancamentoSchema.safeParse(idBruto);
  if (!id.success) {
    return { erro: "Lançamento inválido" };
  }

  const existente = await db.query.lancamentos.findFirst({
    where: eq(lancamentos.id, id.data),
  });
  if (!existente) {
    return { erro: "Lançamento não encontrado" };
  }
  if (existente.parcelamentoId !== null) {
    return { erro: "Parcela de um parcelamento não pode ser editada aqui" };
  }

  const dados = lancamentoSchema.safeParse(dadosBrutos);
  if (!dados.success) {
    return { campos: mapearErrosZod(dados.error) };
  }

  const erro = await validarCategoriaEConta(dados.data);
  if (erro) return erro;

  await db
    .update(lancamentos)
    .set({
      data: dados.data.data,
      descricao: dados.data.descricao,
      valorCentavos: dados.data.valorCentavos,
      tipo: dados.data.tipo,
      categoriaId: dados.data.categoriaId,
      contaId: dados.data.contaId,
      formaPagamento: dados.data.formaPagamento,
      status: dados.data.status,
      observacao: dados.data.observacao ?? null,
      updatedAt: new Date(),
    })
    .where(eq(lancamentos.id, id.data));

  revalidatePath("/lancamentos");
  return {};
}

export async function excluirLancamento(idBruto: number): Promise<ResultadoLancamento> {
  await exigirSessao();

  const id = idLancamentoSchema.safeParse(idBruto);
  if (!id.success) {
    return { erro: "Lançamento inválido" };
  }

  const existente = await db.query.lancamentos.findFirst({
    where: eq(lancamentos.id, id.data),
  });
  if (!existente) {
    return { erro: "Lançamento não encontrado" };
  }
  if (existente.parcelamentoId !== null) {
    return { erro: "Parcela de um parcelamento não pode ser excluída aqui" };
  }

  await db.delete(lancamentos).where(eq(lancamentos.id, id.data));

  revalidatePath("/lancamentos");
  return {};
}
