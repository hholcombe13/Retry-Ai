import { PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma';

const centsToCurrency = (amountCents: number, currency: string) => {
  return `${currency.toUpperCase()} ${(amountCents / 100).toFixed(2)}`;
};

export const getDashboardStats = async () => {
  const [recoveredAgg, failedAgg, activeRetries, recentPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: PaymentStatus.RECOVERED },
      _sum: { amountCents: true },
      _count: { _all: true }
    }),
    prisma.payment.aggregate({
      where: { status: { in: [PaymentStatus.FAILED, PaymentStatus.RETRYING] } },
      _sum: { amountCents: true },
      _count: { _all: true }
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.RETRYING }
    }),
    prisma.payment.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        customer: true,
        creator: true
      }
    })
  ]);

  const recoveredCents = recoveredAgg._sum.amountCents ?? 0;
  const failedCents = failedAgg._sum.amountCents ?? 0;
  const recoveredCount = recoveredAgg._count._all;
  const failedCount = failedAgg._count._all;
  const totalCount = recoveredCount + failedCount;
  const recoveryRate = totalCount === 0 ? 0 : recoveredCount / totalCount;

  return {
    metrics: {
      recoveredRevenueCents: recoveredCents,
      failedRevenueCents: failedCents,
      activeRetries,
      recoveryRate
    },
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      customer: payment.customer?.email || payment.customer?.name || 'Unknown customer',
      creator: payment.creator?.name || 'Unknown creator',
      updatedAt: payment.updatedAt
    }))
  };
};

export const formatStatsForDisplay = (stats: Awaited<ReturnType<typeof getDashboardStats>>) => {
  const primaryCurrency = stats.recentPayments[0]?.currency ?? 'USD';
  return {
    recoveredRevenue: centsToCurrency(stats.metrics.recoveredRevenueCents, primaryCurrency),
    failedRevenue: centsToCurrency(stats.metrics.failedRevenueCents, primaryCurrency),
    activeRetries: stats.metrics.activeRetries,
    recoveryRate: `${(stats.metrics.recoveryRate * 100).toFixed(1)}%`,
    table: stats.recentPayments
  };
};
