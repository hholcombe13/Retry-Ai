import pino from 'pino';
import { env } from './env';

export const logger = pino({
  name: 'retry-ai-server',
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'retry-ai-server' }
});
