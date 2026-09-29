import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  HASURA_GRAPHQL_URL: z.string().url(),
  HASURA_ADMIN_SECRET: z.string().min(1),
  SENTRY_DSN: z.string().url().optional(),
  // Dedicated, higher-urgency alert channel for refund/transfer failures.
  // Distinct from the general Sentry error stream so these events get human
  // attention faster. When unset, alerts fall back to the general error log.
  REFUND_TRANSFER_ALERT_WEBHOOK_URL: z.string().url().optional(),
  REFUND_TRANSFER_ALERT_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
