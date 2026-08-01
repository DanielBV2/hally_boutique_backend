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
  ENVIA_TOKEN: z.string().min(1),
  ENVIA_BASE_URL: z.string().url().default("https://api-test.envia.com"),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.19),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().positive().default(150000),
  SHIPPING_ORIGIN_NUMBER: z.string().min(1),
  SHIPPING_ORIGIN_NAME: z.string().min(1),
  SHIPPING_ORIGIN_PHONE: z.string().min(1),
  SHIPPING_ORIGIN_STREET: z.string().min(1),
  SHIPPING_ORIGIN_CITY: z.string().min(1),
  SHIPPING_ORIGIN_STATE: z.string().min(1),
  SHIPPING_ORIGIN_COUNTRY: z.string().default("CO"),
  SHIPPING_ORIGIN_POSTALCODE: z.string().min(1),
  SHIPPING_CARRIERS: z.string().default("coordinadora,serviEntrega,interRapidisimo,tcc"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: z.infer<typeof envSchema> = parsed.data;
