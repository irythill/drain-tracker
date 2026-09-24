import Link from "next/link";
import { Button, Group, Text } from "@mantine/core";
import { adicionaMeses, inicioDoMes } from "@/lib/data";

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Props = {
  ano: number;
  mes: number;
};

export function NavegacaoMes({ ano, mes }: Props) {
  const atual = inicioDoMes(ano, mes);
  const anterior = adicionaMeses(atual, -1).slice(0, 7);
  const proximo = adicionaMeses(atual, 1).slice(0, 7);

  return (
    <Group justify="space-between">
      <Link href={`/lancamentos?mes=${anterior}`}>
        <Button component="span" variant="subtle">
          ← Mês anterior
        </Button>
      </Link>
      <Text fw={600} size="lg">
        {NOMES_MES[mes - 1]} de {ano}
      </Text>
      <Link href={`/lancamentos?mes=${proximo}`}>
        <Button component="span" variant="subtle">
          Próximo mês →
        </Button>
      </Link>
    </Group>
  );
}
