import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const createClient = () => {
  const client = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
  });

  client.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (error) {
      logger.error({ params, error }, 'Prisma middleware error');
      throw error;
    }
  });

  return client;
};

export const prisma = global.prisma || createClient();

if (env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
