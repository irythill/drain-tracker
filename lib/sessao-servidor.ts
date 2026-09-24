import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_COOKIE_SESSAO, verificarToken } from "@/lib/sessao";

export async function exigirSessao(): Promise<void> {
  const secret = process.env.SESSAO_SECRET;
  const senhaConfigurada = process.env.SENHA_ACESSO;
  const store = await cookies();
  const token = store.get(NOME_COOKIE_SESSAO)?.value;

  const autenticado = Boolean(
    secret && senhaConfigurada && token && (await verificarToken(token, secret, Date.now())),
  );

  if (!autenticado) {
    redirect("/login");
  }
}
