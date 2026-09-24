import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarToken } from "@/lib/sessao";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const secret = process.env.SESSAO_SECRET;
  const senhaConfigurada = process.env.SENHA_ACESSO;
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;

  const autenticado = Boolean(
    secret &&
      senhaConfigurada &&
      token &&
      (await verificarToken(token, secret, Date.now())),
  );

  if (!autenticado) {
    const loginUrl = new URL("/login", request.url);
    const metodoSeguro = request.method === "GET" || request.method === "HEAD";
    return NextResponse.redirect(loginUrl, metodoSeguro ? undefined : 303);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
