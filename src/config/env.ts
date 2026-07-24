import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  WOMPI_PUBLIC_KEY: z.string().min(1),
  WOMPI_PRIVATE_KEY: z.string().min(1),
  WOMPI_INTEGRITY_SECRET: z.string().min(1),
  WOMPI_EVENTS_SECRET: z.string().min(1),
  WOMPI_REDIRECT_URL: z.string().url(),
  WOMPI_API_BASE_URL: z.string().url().default("https://sandbox.wompi.co/v1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: z.infer<typeof envSchema> = parsed.data;
