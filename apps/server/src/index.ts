import express from 'express';
import cors from 'cors';
import { env } from './env';
import { logger } from './logger';
import { statsRouter } from './routes/stats';
import { stripeWebhookHandler } from './routes/stripe';
import { prisma } from './prisma';
import { discordBot } from './bot/discordBot';

const app = express();

app.use(cors({ origin: env.DASHBOARD_ORIGIN ?? true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/stats', statsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Internal server error' });
});

const start = async () => {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to PostgreSQL');
    process.exit(1);
  }

  if (env.DISCORD_BOT_TOKEN) {
    logger.info('Discord bot token detected; client will initialise on first message');
  }

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Retry.ai server listening');
  });
};

start().catch((error) => {
  logger.error({ error }, 'Server failed to start');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});
