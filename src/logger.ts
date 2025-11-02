import pino from 'pino';
import { appConfig } from './config';

export const logger = pino({
  name: 'retry-ai',
  level: appConfig.environment === 'production' ? 'info' : 'debug',
  messageKey: 'message',
  base: {
    app: 'retry-ai'
  }
});
