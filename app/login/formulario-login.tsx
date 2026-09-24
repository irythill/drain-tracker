"use client";

import { useTransition } from "react";
import { Button, PasswordInput, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { entrar } from "@/app/login/actions";
import { entrarSchema } from "@/app/login/schema";

export function FormularioLogin() {
  const [pendente, iniciarTransicao] = useTransition();

  const form = useForm({
    initialValues: { senha: "" },
    validate: (valores) => {
      const resultado = entrarSchema.safeParse(valores);
      if (resultado.success) {
        return {};
      }
      return { senha: resultado.error.issues[0]?.message };
    },
  });

  const enviar = form.onSubmit((valores) => {
    iniciarTransicao(async () => {
      const resultado = await entrar(valores.senha);
      if (resultado?.campos?.senha) {
        form.setFieldError("senha", resultado.campos.senha);
      }
    });
  });

  return (
    <Stack gap="md" component="div">
      <PasswordInput
        label="Senha"
        placeholder="Senha de acesso"
        autoFocus
        data-autofocus
        {...form.getInputProps("senha")}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            enviar();
          }
        }}
      />
      <Button onClick={() => enviar()} loading={pendente}>
        Entrar
      </Button>
    </Stack>
  );
}
