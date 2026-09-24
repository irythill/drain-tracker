import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Container, Stack, Title } from "@mantine/core";
import { db } from "@/db/client";
import { categorias, contas, lancamentos } from "@/db/schema";
import { fimDoMes, hojeISO, inicioDoMes } from "@/lib/data";
import { parseMes, totaisDoMes } from "@/lib/lancamentos-mes";
import { NavegacaoMes } from "@/app/lancamentos/navegacao-mes";
import { CardsTotais } from "@/app/lancamentos/cards-totais";
import { QuadroLancamentos } from "@/app/lancamentos/quadro-lancamentos";

type Props = {
  searchParams: Promise<{ mes?: string }>;
};

export default async function LancamentosPage({ searchParams }: Props) {
  const { mes: mesParam } = await searchParams;
  const hoje = hojeISO();
  const { ano, mes } = (mesParam && parseMes(mesParam)) || parseMes(hoje.slice(0, 7))!;

  const inicio = inicioDoMes(ano, mes);
  const fim = fimDoMes(ano, mes);

  const [lista, categoriasAtivas, contasAtivas] = await Promise.all([
    db.query.lancamentos.findMany({
      where: and(gte(lancamentos.data, inicio), lte(lancamentos.data, fim)),
      with: { categoria: true, conta: true },
      orderBy: asc(lancamentos.data),
    }),
    db.select().from(categorias).where(eq(categorias.arquivada, false)),
    db.select().from(contas).where(eq(contas.arquivada, false)),
  ]);

  const totais = totaisDoMes(lista);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Title order={1}>Lançamentos</Title>
        <NavegacaoMes ano={ano} mes={mes} />
        <CardsTotais totais={totais} />
        <QuadroLancamentos
          lancamentos={lista}
          categorias={categoriasAtivas}
          contas={contasAtivas}
          hoje={hoje}
        />
      </Stack>
    </Container>
  );
}
