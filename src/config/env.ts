import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Detect test environment: check NODE_ENV or if running under Jest
const isTestEnv = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

// Load .env.test in test environment, otherwise load .env
const envFile = isTestEnv ? ".env.test" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  RESEND_API_KEY: z.string().default(""),
  FROM_EMAIL: z.string().default(""),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  STRIPE_WEBHOOK_TOLERANCE: z.coerce.number().default(300),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  PAYPAL_CLIENT_ID: z.string().default(""),
  PAYPAL_CLIENT_SECRET: z.string().default(""),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  ANTHROPIC_API_KEY: z.string().default(""),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`Invalid environment variables: ${details}`);
}

const env = parsed.data;

export function getEnv(): EnvConfig {
  return env;
}

export default env;
