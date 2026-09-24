/**
 * Sessão de usuário único via token assinado (HMAC-SHA256, Web Crypto).
 * Sem dependências novas para funcionar tanto em runtime edge quanto node.
 */

export const NOME_COOKIE_SESSAO = "sessao";
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

function paraBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(valor: string): Uint8Array | null {
  try {
    const normalizado = valor.replace(/-/g, "+").replace(/_/g, "/");
    const preenchido = normalizado.padEnd(
      normalizado.length + ((4 - (normalizado.length % 4)) % 4),
      "=",
    );
    const binario = atob(preenchido);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importarChave(secret: string, usos: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usos,
  );
}

async function assinar(payload: string, secret: string): Promise<string> {
  const chave = await importarChave(secret, ["sign"]);
  const assinatura = await globalThis.crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(payload),
  );
  return paraBase64Url(new Uint8Array(assinatura));
}

async function verificarAssinatura(
  payload: string,
  assinatura: string,
  secret: string,
): Promise<boolean> {
  const assinaturaBytes = deBase64Url(assinatura);
  if (!assinaturaBytes) {
    return false;
  }
  const chave = await importarChave(secret, ["verify"]);
  return globalThis.crypto.subtle.verify(
    "HMAC",
    chave,
    assinaturaBytes as BufferSource,
    new TextEncoder().encode(payload),
  );
}

/**
 * Compara duas strings em tempo constante sem vazar o comprimento pela
 * comparação direta: hasheia ambas para um digest de tamanho fixo antes.
 * Normaliza NFC para que a mesma senha digitada com composição Unicode
 * diferente (ex.: acento combinante vs. caractere precomposto) seja igual.
 */
export async function compararSenhaConstante(a: string, b: string): Promise<boolean> {
  const digest = async (valor: string) =>
    new Uint8Array(
      await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(valor.normalize("NFC")),
      ),
    );
  const [digestA, digestB] = await Promise.all([digest(a), digest(b)]);
  let diferenca = 0;
  for (let i = 0; i < digestA.length; i++) {
    diferenca |= digestA[i] ^ digestB[i];
  }
  return diferenca === 0;
}

export async function criarToken(secret: string, agoraMs: number): Promise<string> {
  const expiraEm = agoraMs + VALIDADE_MS;
  const payload = paraBase64Url(new TextEncoder().encode(String(expiraEm)));
  const assinatura = await assinar(payload, secret);
  return `${payload}.${assinatura}`;
}

export async function verificarToken(
  token: string,
  secret: string,
  agoraMs: number,
): Promise<boolean> {
  try {
    if (!secret) {
      return false;
    }

    const partes = token.split(".");
    if (partes.length !== 2) {
      return false;
    }
    const [payload, assinatura] = partes;

    if (!(await verificarAssinatura(payload, assinatura, secret))) {
      return false;
    }

    const payloadBytes = deBase64Url(payload);
    if (!payloadBytes) {
      return false;
    }
    const expiraEm = Number(new TextDecoder().decode(payloadBytes));
    if (!Number.isFinite(expiraEm)) {
      return false;
    }

    return agoraMs < expiraEm;
  } catch {
    return false;
  }
}
