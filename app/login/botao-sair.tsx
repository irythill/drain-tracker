"use client";

import { useTransition } from "react";
import { Button } from "@mantine/core";
import { sair } from "@/app/login/actions";

export function BotaoSair() {
  const [pendente, iniciarTransicao] = useTransition();

  return (
    <Button
      type="button"
      variant="subtle"
      loading={pendente}
      onClick={() => iniciarTransicao(() => sair())}
    >
      Sair
    </Button>
  );
}
