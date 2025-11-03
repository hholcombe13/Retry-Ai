import { Router } from 'express';
import { getDashboardStats } from '../services/stats-service';
import { logger } from '../logger';

export const statsRouter = Router();

statsRouter.get('/', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch dashboard stats');
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});
