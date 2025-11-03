import { fetchDashboardStats } from '@/lib/api';
import { StatCard } from '@/components/StatCard';

const formatCurrency = (amountCents: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amountCents / 100);
};

const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

const statusBadge = (status: string) => {
  switch (status) {
    case 'RECOVERED':
      return { label: 'Recovered', className: 'badge badge-success' };
    case 'FAILED':
      return { label: 'Failed', className: 'badge badge-failed' };
    case 'RETRYING':
      return { label: 'Retrying', className: 'badge badge-retrying' };
    default:
      return { label: status, className: 'badge' };
  }
};

export default async function DashboardPage() {
  const stats = await fetchDashboardStats();

  if (!stats) {
    return (
      <section className="table-card">
        <header>
          <h3>Retry activity</h3>
        </header>
        <div className="empty-state">
          <p>Connect Stripe and trigger events to see recovery insights in real time.</p>
        </div>
      </section>
    );
  }

  const currency = stats.recentPayments[0]?.currency || 'USD';
  const recoveredRevenue = formatCurrency(stats.metrics.recoveredRevenueCents, currency);
  const failedRevenue = formatCurrency(stats.metrics.failedRevenueCents, currency);
  const recoveryRate = formatPercentage(stats.metrics.recoveryRate);

  return (
    <div className="dashboard">
      <section className="stat-grid">
        <StatCard title="Recovered revenue" value={recoveredRevenue} detail="Payments successfully collected" />
        <StatCard title="At-risk revenue" value={failedRevenue} detail="Failed or retrying charges" />
        <StatCard title="Active retries" value={String(stats.metrics.activeRetries)} detail="Payments scheduled for recovery" />
        <StatCard title="Recovery rate" value={recoveryRate} detail="Recovered vs failed payments" />
      </section>

      <section className="table-card">
        <header>
          <h3>Recent payment outcomes</h3>
        </header>
        {stats.recentPayments.length === 0 ? (
          <div className="empty-state">
            <p>No payment activity yet. Failed Stripe invoices will appear here instantly.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Creator</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentPayments.map((payment) => {
                const badge = statusBadge(payment.status);
                return (
                  <tr key={payment.id}>
                    <td>{payment.customer}</td>
                    <td>{payment.creator}</td>
                    <td>{formatCurrency(payment.amountCents, payment.currency)}</td>
                    <td>
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td>{new Date(payment.updatedAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
