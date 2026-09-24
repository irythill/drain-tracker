import { Container, Stack, Title } from "@mantine/core";
import { FormularioLogin } from "@/app/login/formulario-login";

export default function LoginPage() {
  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Title order={1}>Entrar</Title>
        <FormularioLogin />
      </Stack>
    </Container>
  );
}
