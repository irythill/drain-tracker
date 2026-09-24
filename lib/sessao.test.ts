import { describe, expect, it } from "vitest";
import { compararSenhaConstante, criarToken, verificarToken } from "@/lib/sessao";

const SECRET = "segredo-de-teste-com-tamanho-razoavel";
const AGORA = new Date("2026-01-01T00:00:00Z").getTime();

describe("sessao", () => {
  it("aceita um token recém-criado com o mesmo secret", async () => {
    const token = await criarToken(SECRET, AGORA);
    expect(await verificarToken(token, SECRET, AGORA)).toBe(true);
  });

  it("rejeita token com assinatura adulterada", async () => {
    const token = await criarToken(SECRET, AGORA);
    const [payload, assinatura] = token.split(".");
    const adulterado = `${payload}.${assinatura.slice(0, -1)}${assinatura.at(-1) === "a" ? "b" : "a"}`;
    expect(await verificarToken(adulterado, SECRET, AGORA)).toBe(false);
  });

  it("rejeita token válido assinado com secret diferente", async () => {
    const token = await criarToken(SECRET, AGORA);
    expect(await verificarToken(token, "outro-secret-completamente-diferente", AGORA)).toBe(
      false,
    );
  });

  it("rejeita token expirado", async () => {
    const token = await criarToken(SECRET, AGORA);
    const trintaEUmDiasDepois = AGORA + 31 * 24 * 60 * 60 * 1000;
    expect(await verificarToken(token, SECRET, trintaEUmDiasDepois)).toBe(false);
  });

  it("aceita token um instante antes de expirar e rejeita um instante depois", async () => {
    const token = await criarToken(SECRET, AGORA);
    const trinta = 30 * 24 * 60 * 60 * 1000;
    expect(await verificarToken(token, SECRET, AGORA + trinta - 1)).toBe(true);
    expect(await verificarToken(token, SECRET, AGORA + trinta + 1)).toBe(false);
  });

  it.each([["lixo"], [""], ["a.b.c"], ["semponto"], ["....."]])(
    "rejeita formato inválido: %s",
    async (invalido) => {
      expect(await verificarToken(invalido, SECRET, AGORA)).toBe(false);
    },
  );

  it("rejeita payload adulterado mesmo com a assinatura original", async () => {
    const token = await criarToken(SECRET, AGORA);
    const [payload, assinatura] = token.split(".");
    const payloadAdulterado = payload.slice(0, -1) + (payload.at(-1) === "A" ? "B" : "A");
    expect(await verificarToken(`${payloadAdulterado}.${assinatura}`, SECRET, AGORA)).toBe(false);
  });

  it("retorna false sem lançar quando o secret é vazio", async () => {
    const token = await criarToken(SECRET, AGORA);
    await expect(verificarToken(token, "", AGORA)).resolves.toBe(false);
  });
});

describe("compararSenhaConstante", () => {
  it("retorna true para strings iguais", async () => {
    expect(await compararSenhaConstante("mesma-senha", "mesma-senha")).toBe(true);
  });

  it("retorna false para strings diferentes", async () => {
    expect(await compararSenhaConstante("senha-a", "senha-b")).toBe(false);
  });

  it("retorna true para duas strings vazias", async () => {
    expect(await compararSenhaConstante("", "")).toBe(true);
  });

  it("considera iguais a mesma senha acentuada em NFC e NFD", async () => {
    const nfc = "senha-café".normalize("NFC");
    const nfd = "senha-café".normalize("NFD");
    expect(nfc).not.toBe(nfd);
    expect(await compararSenhaConstante(nfc, nfd)).toBe(true);
  });
});
