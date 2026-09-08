import { Container, Stack, Text, Title } from "@mantine/core";

export default function HomePage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xs">
        <Title order={1}>Drain Tracker</Title>
        <Text c="dimmed">
          Fundação pronta. Painel, lançamentos e importação vêm a seguir.
        </Text>
      </Stack>
    </Container>
  );
}
