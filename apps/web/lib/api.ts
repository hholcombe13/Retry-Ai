export interface DashboardStats {
  metrics: {
    recoveredRevenueCents: number;
    failedRevenueCents: number;
    activeRetries: number;
    recoveryRate: number;
  };
  recentPayments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    customer: string;
    creator: string;
    updatedAt: string;
  }>;
}

const defaultApiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export const fetchDashboardStats = async (): Promise<DashboardStats | null> => {
  try {
    const response = await fetch(`${defaultApiBase}/api/stats`, {
      next: { revalidate: 15 }
    });

    if (!response.ok) {
      console.warn('Failed to fetch dashboard stats', response.statusText);
      return null;
    }

    return (await response.json()) as DashboardStats;
  } catch (error) {
    console.warn('Dashboard stats request failed', error);
    return null;
  }
};
