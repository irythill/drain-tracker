import { z } from "zod";

export const entrarSchema = z.object({
  senha: z.string().min(1, "Informe a senha"),
});
