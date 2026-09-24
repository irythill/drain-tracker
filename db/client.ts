import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env.local e preencha.",
  );
}

/** Único ponto de acesso ao banco. Query é Drizzle, nunca SQL cru. */
export const db = drizzle(postgres(url), { schema, casing: "snake_case" });
