import { Container, Group, Stack, Text, Title } from "@mantine/core";
import { BotaoSair } from "@/app/login/botao-sair";

export default function HomePage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={1}>Drain Tracker</Title>
          <BotaoSair />
        </Group>
        <Text c="dimmed">
          Fundação pronta. Painel, lançamentos e importação vêm a seguir.
        </Text>
      </Stack>
    </Container>
  );
}
