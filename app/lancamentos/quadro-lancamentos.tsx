"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { TabelaLancamentos } from "@/app/lancamentos/tabela-lancamentos";
import { FormularioLancamento } from "@/app/lancamentos/formulario-lancamento";
import { excluirLancamento } from "@/app/lancamentos/actions";
import type { LancamentoComRelacoes } from "@/app/lancamentos/tipos";
import type { Categoria, Conta } from "@/db/schema";
import type { DataISO } from "@/lib/data";

type Props = {
  lancamentos: LancamentoComRelacoes[];
  categorias: Categoria[];
  contas: Conta[];
  hoje: DataISO;
};

export function QuadroLancamentos({ lancamentos, categorias, contas, hoje }: Props) {
  const router = useRouter();
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<LancamentoComRelacoes | null>(null);
  const [paraExcluir, setParaExcluir] = useState<LancamentoComRelacoes | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [excluindo, iniciarExclusao] = useTransition();

  function abrirCriacao() {
    setEmEdicao(null);
    setModalAberto(true);
  }

  function abrirEdicao(lancamento: LancamentoComRelacoes) {
    setEmEdicao(lancamento);
    setModalAberto(true);
  }

  function aposSalvar() {
    setModalAberto(false);
    router.refresh();
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    setErroExclusao(null);
    iniciarExclusao(async () => {
      const resultado = await excluirLancamento(paraExcluir.id);
      if (resultado.erro || resultado.campos) {
        const primeiroErroDeCampo = resultado.campos
          ? Object.values(resultado.campos)[0]
          : undefined;
        setErroExclusao(resultado.erro ?? primeiroErroDeCampo ?? "Não foi possível excluir");
        return;
      }
      setParaExcluir(null);
      router.refresh();
    });
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button onClick={abrirCriacao}>Novo lançamento</Button>
      </Group>

      <TabelaLancamentos
        lancamentos={lancamentos}
        hoje={hoje}
        onEditar={abrirEdicao}
        onExcluir={(lancamento) => {
          setErroExclusao(null);
          setParaExcluir(lancamento);
        }}
      />

      <FormularioLancamento
        opened={modalAberto}
        aoFechar={() => setModalAberto(false)}
        categorias={categorias}
        contas={contas}
        lancamento={emEdicao}
        aoSalvar={aposSalvar}
      />

      <Modal
        opened={paraExcluir !== null}
        onClose={() => setParaExcluir(null)}
        title="Excluir lançamento"
      >
        <Stack gap="sm">
          <Text>Excluir "{paraExcluir?.descricao}"? Esta ação não pode ser desfeita.</Text>
          {erroExclusao && (
            <Alert color="red" title="Não foi possível excluir">
              {erroExclusao}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setParaExcluir(null)}>
              Cancelar
            </Button>
            <Button color="red" loading={excluindo} onClick={confirmarExclusao}>
              Excluir
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
