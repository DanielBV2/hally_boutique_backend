import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Mismo patrón que src/config/prisma.ts: Prisma 7 requiere driver adapter.
// Usa DATABASE_URL del entorno (-- .env.test vía dotenv-cli).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
