import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Retry.ai Dashboard',
  description: 'Monitor recovered revenue and retry performance for Whop subscriptions'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="header-content">
              <div>
                <h1>Retry.ai</h1>
                <p>Payment recovery performance</p>
              </div>
              <span className="status-pill">Live sync</span>
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
