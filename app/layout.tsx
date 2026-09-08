import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/charts/styles.css";

import type { Metadata } from "next";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import "dayjs/locale/pt-br";

export const metadata: Metadata = {
  title: "Drain Tracker",
  description: "Controle financeiro pessoal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider defaultColorScheme="auto">
          <DatesProvider settings={{ locale: "pt-br", firstDayOfWeek: 0 }}>
            {children}
          </DatesProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
