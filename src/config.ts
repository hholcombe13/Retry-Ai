import path from 'path';
import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';

loadEnv();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveDatabasePath = (value: string | undefined): string => {
  const resolved = path.resolve(process.cwd(), value ?? './data/retry-ai.sqlite');
  const dir = path.dirname(resolved);
  if (!existsSync(dir)) {
    // Directory creation is deferred to db bootstrap to avoid side effects here.
  }
  return resolved;
};

export const appConfig = {
  port: toNumber(process.env.PORT, 4000),
  environment: process.env.NODE_ENV ?? 'development',
  databasePath: resolveDatabasePath(process.env.DATABASE_PATH),
  whopApiKey: process.env.WHOP_API_KEY,
  emailProvider: process.env.EMAIL_PROVIDER ?? 'console',
  smsProvider: process.env.SMS_PROVIDER ?? 'console',
  discordBotToken: process.env.DISCORD_BOT_TOKEN,
  followUpFromEmail: process.env.FOLLOW_UP_FROM_EMAIL ?? 'payments@example.com'
};

export type AppConfig = typeof appConfig;
