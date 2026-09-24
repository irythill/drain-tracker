import { Card, SimpleGrid, Text } from "@mantine/core";
import { formatarBRL } from "@/lib/dinheiro";
import type { TotaisDoMes } from "@/lib/lancamentos-mes";

export function CardsTotais({ totais }: { totais: TotaisDoMes }) {
  const itens: { rotulo: string; valorCentavos: number; cor: string }[] = [
    { rotulo: "Receitas", valorCentavos: totais.receitasCentavos, cor: "green" },
    { rotulo: "Despesas", valorCentavos: totais.despesasCentavos, cor: "red" },
    {
      rotulo: "Saldo",
      valorCentavos: totais.saldoCentavos,
      cor: totais.saldoCentavos >= 0 ? "green" : "red",
    },
    { rotulo: "Já pago", valorCentavos: totais.pagoCentavos, cor: "gray" },
    { rotulo: "A pagar", valorCentavos: totais.aPagarCentavos, cor: "orange" },
  ];

  return (
    <SimpleGrid cols={{ base: 2, sm: 5 }}>
      {itens.map((item) => (
        <Card key={item.rotulo} withBorder padding="sm">
          <Text size="xs" c="dimmed">
            {item.rotulo}
          </Text>
          <Text fw={700} c={item.cor}>
            {formatarBRL(item.valorCentavos)}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  );
}
