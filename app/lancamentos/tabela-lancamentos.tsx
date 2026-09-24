"use client";

import dayjs from "dayjs";
import { Badge, Button, Group, Table, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { formatarBRL } from "@/lib/dinheiro";
import { estaAtrasado } from "@/lib/lancamentos-mes";
import type { LancamentoComRelacoes } from "@/app/lancamentos/tipos";
import type { DataISO } from "@/lib/data";

const ROTULO_FORMA: Record<string, string> = {
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
};

const AVISO_PARCELAMENTO = "Parcelas são gerenciadas pelo parcelamento";

type Props = {
  lancamentos: LancamentoComRelacoes[];
  hoje: DataISO;
  onEditar: (lancamento: LancamentoComRelacoes) => void;
  onExcluir: (lancamento: LancamentoComRelacoes) => void;
};

export function TabelaLancamentos({ lancamentos, hoje, onEditar, onExcluir }: Props) {
  if (lancamentos.length === 0) {
    return <Text c="dimmed">Nenhum lançamento neste mês.</Text>;
  }

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Data</Table.Th>
          <Table.Th>Descrição</Table.Th>
          <Table.Th>Categoria</Table.Th>
          <Table.Th>Conta</Table.Th>
          <Table.Th>Forma</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th ta="right">Valor</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lancamentos.map((lancamento) => {
          const atrasado = estaAtrasado(lancamento, hoje);
          const rotuloStatus = atrasado ? "Atrasado" : lancamento.status === "pago" ? "Pago" : "Pendente";
          const corStatus = atrasado ? "red" : lancamento.status === "pago" ? "green" : "gray";
          const bloqueadoPorParcelamento = lancamento.parcelamentoId !== null;

          return (
            <Table.Tr key={lancamento.id}>
              <Table.Td>{dayjs(lancamento.data, "YYYY-MM-DD").format("DD/MM/YYYY")}</Table.Td>
              <Table.Td>
                {bloqueadoPorParcelamento ? (
                  <Tooltip label={AVISO_PARCELAMENTO}>
                    <Text span>{lancamento.descricao}</Text>
                  </Tooltip>
                ) : (
                  <UnstyledButton onClick={() => onEditar(lancamento)}>
                    {lancamento.descricao}
                  </UnstyledButton>
                )}
              </Table.Td>
              <Table.Td>{lancamento.categoria.nome}</Table.Td>
              <Table.Td>{lancamento.conta.nome}</Table.Td>
              <Table.Td>{ROTULO_FORMA[lancamento.formaPagamento]}</Table.Td>
              <Table.Td>
                <Badge color={corStatus}>{rotuloStatus}</Badge>
              </Table.Td>
              <Table.Td ta="right" c={lancamento.tipo === "despesa" ? "red" : "green"}>
                {formatarBRL(lancamento.valorCentavos)}
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {bloqueadoPorParcelamento ? (
                    <Tooltip label={AVISO_PARCELAMENTO}>
                      <span>
                        <Button size="xs" variant="subtle" disabled>
                          Editar
                        </Button>
                        <Button size="xs" variant="subtle" color="red" disabled>
                          Excluir
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <>
                      <Button size="xs" variant="subtle" onClick={() => onEditar(lancamento)}>
                        Editar
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onExcluir(lancamento)}
                      >
                        Excluir
                      </Button>
                    </>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
