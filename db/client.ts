import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
// O build (`next build`) importa as páginas sem env de runtime; postgres-js só
// conecta na primeira query, então a URL só é exigida fora do build.
const emBuild = process.env.NEXT_PHASE === "phase-production-build";
if (!url && !emBuild) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env.local e preencha.",
  );
}

/** Único ponto de acesso ao banco. Query é Drizzle, nunca SQL cru. */
export const db = drizzle(postgres(url ?? ""), { schema, casing: "snake_case" });
