"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_COOKIE_SESSAO, compararSenhaConstante, criarToken } from "@/lib/sessao";
import { exigirSessao } from "@/lib/sessao-servidor";
import { entrarSchema } from "@/app/login/schema";

const VALIDADE_SEGUNDOS = 30 * 24 * 60 * 60;
const ATRASO_SENHA_INCORRETA_MS = 1000;

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type EntrarResultado = {
  campos?: { senha?: string };
};

export async function entrar(senha: string): Promise<EntrarResultado> {
  const dados = entrarSchema.safeParse({ senha });
  if (!dados.success) {
    return { campos: { senha: "Informe a senha" } };
  }

  const senhaEsperada = process.env.SENHA_ACESSO;
  const secret = process.env.SESSAO_SECRET;
  if (!senhaEsperada || !secret) {
    return { campos: { senha: "Autenticação não configurada" } };
  }

  const senhaCorreta = await compararSenhaConstante(dados.data.senha, senhaEsperada);
  if (!senhaCorreta) {
    await aguardar(ATRASO_SENHA_INCORRETA_MS);
    return { campos: { senha: "Senha incorreta" } };
  }

  const token = await criarToken(secret, Date.now());
  const store = await cookies();
  store.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_SEGUNDOS,
  });

  redirect("/");
}

export async function sair(): Promise<void> {
  await exigirSessao();

  const store = await cookies();
  store.delete(NOME_COOKIE_SESSAO);
  redirect("/login");
}
