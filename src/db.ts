import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { appConfig } from './config';
import { logger } from './logger';
import {
  FailedPaymentRecord,
  FollowUpChannel,
  FollowUpStatus,
  FollowUpTaskRecord,
  RecoveryEventRecord
} from './domain/types';
import { nowUtc, toIso } from './utils/time';

const ensureDirectory = (filePath: string) => {
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
};

ensureDirectory(appConfig.databasePath);

export const db = new Database(appConfig.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const bootstrap = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      timezone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT,
      phone TEXT,
      discord_id TEXT,
      timezone TEXT,
      preferred_channel TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      plan_name TEXT,
      price_cents INTEGER,
      currency TEXT,
      status TEXT,
      provider_subscription_id TEXT,
      last_payment_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS failed_payments (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      failed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      next_retry_at TEXT,
      reason TEXT,
      provider_event_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY,
      failed_payment_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      template_id TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      sent_at TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (failed_payment_id) REFERENCES failed_payments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_events (
      id TEXT PRIMARY KEY,
      failed_payment_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      channel TEXT,
      status TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (failed_payment_id) REFERENCES failed_payments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_failed_payments_next_retry ON failed_payments(next_retry_at) WHERE next_retry_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_scheduled ON follow_up_tasks(scheduled_for) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_payment ON follow_up_tasks(failed_payment_id);
  `);
};

bootstrap();

const updateTimestamp = (table: string, id: string) => {
  db.prepare(`UPDATE ${table} SET updated_at = @updated_at WHERE id = @id`).run({
    id,
    updated_at: toIso(nowUtc())
  });
};

export const upsertCreator = (creator: {
  id: string;
  name: string;
  contactEmail?: string | null;
  timezone?: string | null;
}) => {
  const stmt = db.prepare(`
    INSERT INTO creators (id, name, contact_email, timezone)
    VALUES (@id, @name, @contactEmail, @timezone)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      contact_email = excluded.contact_email,
      timezone = excluded.timezone,
      updated_at = datetime('now');
  `);
  stmt.run({
    id: creator.id,
    name: creator.name,
    contactEmail: creator.contactEmail ?? null,
    timezone: creator.timezone ?? null
  });
};

export const upsertCustomer = (customer: {
  id: string;
  email?: string | null;
  phone?: string | null;
  discordId?: string | null;
  timezone?: string | null;
  preferredChannel?: FollowUpChannel | null;
}) => {
  const stmt = db.prepare(`
    INSERT INTO customers (id, email, phone, discord_id, timezone, preferred_channel)
    VALUES (@id, @email, @phone, @discordId, @timezone, @preferredChannel)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, customers.email),
      phone = COALESCE(excluded.phone, customers.phone),
      discord_id = COALESCE(excluded.discord_id, customers.discord_id),
      timezone = COALESCE(excluded.timezone, customers.timezone),
      preferred_channel = COALESCE(excluded.preferred_channel, customers.preferred_channel),
      updated_at = datetime('now');
  `);
  stmt.run({
    id: customer.id,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    discordId: customer.discordId ?? null,
    timezone: customer.timezone ?? null,
    preferredChannel: customer.preferredChannel ?? null
  });
};

export const upsertSubscription = (subscription: {
  id: string;
  creatorId: string;
  customerId: string;
  planName: string;
  priceCents: number;
  currency: string;
  status: string;
  providerSubscriptionId?: string | null;
}) => {
  const stmt = db.prepare(`
    INSERT INTO subscriptions (id, creator_id, customer_id, plan_name, price_cents, currency, status, provider_subscription_id)
    VALUES (@id, @creatorId, @customerId, @planName, @priceCents, @currency, @status, @providerSubscriptionId)
    ON CONFLICT(id) DO UPDATE SET
      creator_id = excluded.creator_id,
      customer_id = excluded.customer_id,
      plan_name = excluded.plan_name,
      price_cents = excluded.price_cents,
      currency = excluded.currency,
      status = excluded.status,
      provider_subscription_id = excluded.provider_subscription_id,
      updated_at = datetime('now');
  `);
  stmt.run({
    id: subscription.id,
    creatorId: subscription.creatorId,
    customerId: subscription.customerId,
    planName: subscription.planName,
    priceCents: subscription.priceCents,
    currency: subscription.currency,
    status: subscription.status,
    providerSubscriptionId: subscription.providerSubscriptionId ?? null
  });
};

export const createFailedPayment = (payment: {
  id?: string;
  subscriptionId: string;
  creatorId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  failedAt: string;
  status: string;
  retryCount?: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  reason?: string | null;
  providerEventId?: string | null;
}): FailedPaymentRecord => {
  const id = payment.id ?? randomUUID();
  const stmt = db.prepare(`
    INSERT INTO failed_payments (
      id, subscription_id, creator_id, customer_id, amount_cents, currency,
      failed_at, status, retry_count, last_attempt_at, next_retry_at, reason, provider_event_id
    ) VALUES (
      @id, @subscriptionId, @creatorId, @customerId, @amountCents, @currency,
      @failedAt, @status, @retryCount, @lastAttemptAt, @nextRetryAt, @reason, @providerEventId
    )
  `);
  stmt.run({
    id,
    subscriptionId: payment.subscriptionId,
    creatorId: payment.creatorId,
    customerId: payment.customerId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    failedAt: payment.failedAt,
    status: payment.status,
    retryCount: payment.retryCount ?? 0,
    lastAttemptAt: payment.lastAttemptAt ?? null,
    nextRetryAt: payment.nextRetryAt ?? null,
    reason: payment.reason ?? null,
    providerEventId: payment.providerEventId ?? null
  });
  return getFailedPaymentById(id)!;
};

export const getFailedPaymentById = (id: string): FailedPaymentRecord | undefined => {
  const row = db
    .prepare(`SELECT * FROM failed_payments WHERE id = ?`)
    .get(id) as FailedPaymentRecord | undefined;
  return row;
};

export const scheduleFollowUps = (
  tasks: Array<{
    failedPaymentId: string;
    channel: FollowUpChannel;
    templateId: string;
    scheduledFor: string;
    metadata?: Record<string, unknown>;
  }>
): FollowUpTaskRecord[] => {
  const stmt = db.prepare(`
    INSERT INTO follow_up_tasks (id, failed_payment_id, channel, template_id, status, scheduled_for, metadata)
    VALUES (@id, @failedPaymentId, @channel, @templateId, 'pending', @scheduledFor, @metadata)
  `);
  const records: FollowUpTaskRecord[] = [];
  const insertMany = db.transaction((entries: typeof tasks) => {
    for (const item of entries) {
      const id = randomUUID();
      stmt.run({
        id,
        failedPaymentId: item.failedPaymentId,
        channel: item.channel,
        templateId: item.templateId,
        scheduledFor: item.scheduledFor,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null
      });
      records.push({
        id,
        failedPaymentId: item.failedPaymentId,
        channel: item.channel,
        templateId: item.templateId,
        status: 'pending',
        scheduledFor: item.scheduledFor,
        metadata: item.metadata ?? null
      });
    }
  });
  insertMany(tasks);
  return records;
};

export const getPendingFollowUps = (limit = 20): FollowUpTaskRecord[] => {
  return db
    .prepare(
      `SELECT * FROM follow_up_tasks WHERE status = 'pending' AND scheduled_for <= datetime('now') ORDER BY scheduled_for ASC LIMIT ?`
    )
    .all(limit) as FollowUpTaskRecord[];
};

export const markFollowUpStatus = (id: string, status: FollowUpStatus, sentAt?: string | null) => {
  db.prepare(
    `UPDATE follow_up_tasks SET status = @status, sent_at = @sent_at, updated_at = datetime('now') WHERE id = @id`
  ).run({
    id,
    status,
    sent_at: sentAt ?? null
  });
};

export const logRecoveryEvent = (
  event: Omit<RecoveryEventRecord, 'id' | 'createdAt'> & { details?: Record<string, unknown> | null }
) => {
  const stmt = db.prepare(
    `INSERT INTO recovery_events (id, failed_payment_id, event_type, channel, status, details)
     VALUES (@id, @failedPaymentId, @eventType, @channel, @status, @details)`
  );
  stmt.run({
    id: randomUUID(),
    failedPaymentId: event.failedPaymentId,
    eventType: event.eventType,
    channel: event.channel ?? null,
    status: event.status,
    details: event.details ? JSON.stringify(event.details) : null
  });
};

export const updateFailedPaymentAfterRetry = (id: string, update: {
  status: string;
  retryCount: number;
  lastAttemptAt: string;
  nextRetryAt?: string | null;
}) => {
  db.prepare(
    `UPDATE failed_payments
     SET status = @status,
         retry_count = @retryCount,
         last_attempt_at = @lastAttemptAt,
         next_retry_at = @nextRetryAt,
         updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id,
    status: update.status,
    retryCount: update.retryCount,
    lastAttemptAt: update.lastAttemptAt,
    nextRetryAt: update.nextRetryAt ?? null
  });
};

export const markFailedPaymentRecovered = (id: string, recoveredAt: string) => {
  db.prepare(
    `UPDATE failed_payments SET status = 'recovered', last_attempt_at = @recoveredAt, next_retry_at = NULL, updated_at = datetime('now') WHERE id = @id`
  ).run({
    id,
    recoveredAt
  });
};

export const updateFailedPaymentStatus = (id: string, status: string) => {
  db.prepare(`UPDATE failed_payments SET status = @status, updated_at = datetime('now') WHERE id = @id`).run({
    id,
    status
  });
};

export const listFailedPaymentsByCreator = (creatorId: string) => {
  return db
    .prepare(
      `SELECT fp.*, c.email AS customer_email, c.phone AS customer_phone, c.discord_id AS customer_discord_id,
              s.plan_name AS subscription_plan_name
       FROM failed_payments fp
       LEFT JOIN customers c ON fp.customer_id = c.id
       LEFT JOIN subscriptions s ON fp.subscription_id = s.id
       WHERE fp.creator_id = ?
       ORDER BY fp.failed_at DESC`
    )
    .all(creatorId);
};

export const getDueFailedPaymentsForRetry = (limit = 10): FailedPaymentRecord[] => {
  return db
    .prepare(
      `SELECT * FROM failed_payments
       WHERE status IN ('pending', 'engaging', 'retrying')
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= datetime('now')
       ORDER BY next_retry_at ASC
       LIMIT ?`
    )
    .all(limit) as FailedPaymentRecord[];
};

export const getCustomerById = (id: string) => {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
};

export const getCreatorById = (id: string) => {
  return db.prepare(`SELECT * FROM creators WHERE id = ?`).get(id);
};

export const getSubscriptionById = (id: string) => {
  return db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(id);
};

export const getFollowUpsForPayment = (failedPaymentId: string): FollowUpTaskRecord[] => {
  return db
    .prepare(`SELECT * FROM follow_up_tasks WHERE failed_payment_id = ? ORDER BY scheduled_for ASC`)
    .all(failedPaymentId) as FollowUpTaskRecord[];
};

export const getRecoveryTimeline = (failedPaymentId: string): RecoveryEventRecord[] => {
  return db
    .prepare(`SELECT * FROM recovery_events WHERE failed_payment_id = ? ORDER BY created_at ASC`)
    .all(failedPaymentId) as RecoveryEventRecord[];
};

logger.info({ path: appConfig.databasePath }, 'SQLite database initialised');
