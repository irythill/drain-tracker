"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { paraCentavos } from "@/lib/dinheiro";
import {
  FORMAS_PAGAMENTO,
  POSTGRES_INT_MAX,
  STATUS_LANCAMENTO,
  TIPOS_LANCAMENTO,
  lancamentoSchema,
} from "@/lib/lancamento-schema";
import { criarLancamento, editarLancamento } from "@/app/lancamentos/actions";
import type { LancamentoComRelacoes } from "@/app/lancamentos/tipos";
import type { Categoria, Conta } from "@/db/schema";

const ROTULO_TIPO: Record<string, string> = { receita: "Receita", despesa: "Despesa" };
const ROTULO_FORMA: Record<string, string> = {
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
};
const ROTULO_STATUS: Record<string, string> = { pago: "Pago", pendente: "Pendente" };

type Props = {
  opened: boolean;
  aoFechar: () => void;
  categorias: Categoria[];
  contas: Conta[];
  lancamento: LancamentoComRelacoes | null;
  aoSalvar: () => void;
};

export function FormularioLancamento({
  opened,
  aoFechar,
  categorias,
  contas,
  lancamento,
  aoSalvar,
}: Props) {
  return (
    <Modal
      opened={opened}
      onClose={aoFechar}
      title={lancamento ? "Editar lançamento" : "Novo lançamento"}
    >
      {opened && (
        <ConteudoFormulario
          key={lancamento?.id ?? "novo"}
          categorias={categorias}
          contas={contas}
          lancamento={lancamento}
          aoFechar={aoFechar}
          aoSalvar={aoSalvar}
        />
      )}
    </Modal>
  );
}

type ConteudoProps = Omit<Props, "opened">;

function ConteudoFormulario({
  categorias,
  contas,
  lancamento,
  aoFechar,
  aoSalvar,
}: ConteudoProps) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const form = useForm({
    initialValues: lancamento
      ? {
          data: lancamento.data,
          descricao: lancamento.descricao,
          valorCentavos: lancamento.valorCentavos,
          tipo: lancamento.tipo,
          categoriaId: lancamento.categoriaId,
          contaId: lancamento.contaId,
          formaPagamento: lancamento.formaPagamento,
          status: lancamento.status,
          observacao: lancamento.observacao ?? "",
        }
      : {
          data: "",
          descricao: "",
          valorCentavos: 0,
          tipo: "despesa" as const,
          categoriaId: 0,
          contaId: 0,
          formaPagamento: "pix" as const,
          status: "pendente" as const,
          observacao: "",
        },
    validate: (valores) => {
      const resultado = lancamentoSchema.safeParse(valores);
      if (resultado.success) {
        return {};
      }
      const erros: Record<string, string> = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0];
        if (typeof campo === "string" && !(campo in erros)) {
          erros[campo] = issue.message;
        }
      }
      return erros;
    },
  });

  const categoriasDoTipo = categorias.filter((c) => c.tipo === form.values.tipo);

  const enviar = form.onSubmit((valores) => {
    setErroGeral(null);
    iniciarTransicao(async () => {
      const resultado = lancamento
        ? await editarLancamento(lancamento.id, valores)
        : await criarLancamento(valores);

      if (resultado.erro) {
        setErroGeral(resultado.erro);
        return;
      }

      if (resultado.campos) {
        const campos = resultado.campos as Record<string, string | undefined>;
        const camposValidos = Object.fromEntries(
          Object.entries(campos).filter(
            (par): par is [string, string] => par[1] !== undefined,
          ),
        );
        if (Object.keys(camposValidos).length > 0) {
          form.setErrors(camposValidos);
        } else {
          setErroGeral("Não foi possível salvar o lançamento");
        }
        return;
      }

      aoSalvar();
    });
  });

  return (
    <Stack gap="sm" component="div">
      {erroGeral && (
        <Alert color="red" title="Não foi possível salvar">
          {erroGeral}
        </Alert>
      )}

      <Select
        label="Tipo"
        data={TIPOS_LANCAMENTO.map((tipo) => ({ value: tipo, label: ROTULO_TIPO[tipo] }))}
        value={form.values.tipo}
        onChange={(valor) => {
          if (valor) {
            form.setFieldValue("tipo", valor as (typeof TIPOS_LANCAMENTO)[number]);
            form.setFieldValue("categoriaId", 0);
          }
        }}
        allowDeselect={false}
      />

      <DatePickerInput
        label="Data"
        valueFormat="DD/MM/YYYY"
        value={form.values.data ? dayjs(form.values.data, "YYYY-MM-DD").toDate() : null}
        onChange={(valor) =>
          form.setFieldValue("data", valor ? dayjs(valor).format("YYYY-MM-DD") : "")
        }
        error={form.errors.data}
      />

      <TextInput label="Descrição" {...form.getInputProps("descricao")} />

      <NumberInput
        label="Valor (R$)"
        decimalScale={2}
        fixedDecimalScale
        min={0}
        max={POSTGRES_INT_MAX / 100}
        value={form.values.valorCentavos / 100}
        onChange={(valor) =>
          form.setFieldValue("valorCentavos", typeof valor === "number" ? paraCentavos(valor) : 0)
        }
        error={form.errors.valorCentavos}
      />

      <Select
        label="Categoria"
        placeholder="Selecione"
        data={categoriasDoTipo.map((categoria) => ({
          value: String(categoria.id),
          label: categoria.nome,
        }))}
        value={form.values.categoriaId ? String(form.values.categoriaId) : null}
        onChange={(valor) => form.setFieldValue("categoriaId", valor ? Number(valor) : 0)}
        error={form.errors.categoriaId}
      />

      <Select
        label="Conta"
        placeholder="Selecione"
        data={contas.map((conta) => ({ value: String(conta.id), label: conta.nome }))}
        value={form.values.contaId ? String(form.values.contaId) : null}
        onChange={(valor) => form.setFieldValue("contaId", valor ? Number(valor) : 0)}
        error={form.errors.contaId}
      />

      <Select
        label="Forma de pagamento"
        data={FORMAS_PAGAMENTO.map((forma) => ({ value: forma, label: ROTULO_FORMA[forma] }))}
        value={form.values.formaPagamento}
        onChange={(valor) => {
          if (valor) form.setFieldValue("formaPagamento", valor as (typeof FORMAS_PAGAMENTO)[number]);
        }}
        allowDeselect={false}
      />

      <Select
        label="Status"
        data={STATUS_LANCAMENTO.map((status) => ({ value: status, label: ROTULO_STATUS[status] }))}
        value={form.values.status}
        onChange={(valor) => {
          if (valor) form.setFieldValue("status", valor as (typeof STATUS_LANCAMENTO)[number]);
        }}
        allowDeselect={false}
      />

      <Textarea label="Observação" {...form.getInputProps("observacao")} />

      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button onClick={() => enviar()} loading={pendente}>
          Salvar
        </Button>
      </Group>
    </Stack>
  );
}
