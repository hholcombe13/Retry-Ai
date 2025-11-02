import { logger } from '../logger';
import {
  getPendingFollowUps,
  markFollowUpStatus,
  logRecoveryEvent,
  getFailedPaymentById,
  getCustomerById,
  getCreatorById,
  getSubscriptionById,
  updateFailedPaymentStatus,
  getDueFailedPaymentsForRetry,
  updateFailedPaymentAfterRetry,
  markFailedPaymentRecovered
} from '../db';
import { notifierService } from './notifier';
import { computeNextRetryAt } from './followup-planner';
import { whopClient } from './whop-client';
import { nowUtc, toIso } from '../utils/time';

const FOLLOW_UP_POLL_INTERVAL_MS = 30_000;
const RETRY_POLL_INTERVAL_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 5;

const processFollowUps = async () => {
  const pending = getPendingFollowUps();
  if (!pending.length) return;

  logger.debug({ count: pending.length }, 'Processing follow-up tasks');

  for (const task of pending) {
    const failedPayment = getFailedPaymentById(task.failedPaymentId);
    if (!failedPayment) {
      logger.warn({ taskId: task.id }, 'Skipping follow-up task for missing failed payment');
      markFollowUpStatus(task.id, 'failed');
      continue;
    }

    const customer = getCustomerById(failedPayment.customerId);
    const creator = getCreatorById(failedPayment.creatorId);
    const subscription = getSubscriptionById(failedPayment.subscriptionId);

    if (!customer || !creator) {
      logger.warn({ taskId: task.id }, 'Missing customer or creator for follow-up');
      markFollowUpStatus(task.id, 'failed');
      continue;
    }

    const result = await notifierService.send({
      creator: {
        id: creator.id,
        name: creator.name,
        contactEmail: creator.contact_email
      },
      customer: {
        email: customer.email,
        phone: customer.phone,
        discordId: customer.discord_id,
        name: customer.email?.split('@')[0]
      },
      payment: {
        amountCents: failedPayment.amount_cents,
        currency: failedPayment.currency,
        planName: subscription?.plan_name,
        failedAt: failedPayment.failed_at,
        retryCount: failedPayment.retry_count
      },
      task
    });

    const timestamp = toIso(nowUtc());

    if (result.success) {
      markFollowUpStatus(task.id, 'sent', timestamp);
      if (failedPayment.status === 'pending') {
        updateFailedPaymentStatus(failedPayment.id, 'engaging');
      }
      logRecoveryEvent({
        failedPaymentId: failedPayment.id,
        eventType: 'follow_up',
        channel: task.channel,
        status: 'success',
        details: {
          taskId: task.id,
          templateId: task.templateId,
          message: result.detail
        }
      });
    } else {
      markFollowUpStatus(task.id, 'failed');
      logRecoveryEvent({
        failedPaymentId: failedPayment.id,
        eventType: 'follow_up',
        channel: task.channel,
        status: 'failure',
        details: {
          taskId: task.id,
          reason: result.detail
        }
      });
    }
  }
};

const processRetryQueue = async () => {
  const duePayments = getDueFailedPaymentsForRetry();
  if (!duePayments.length) return;

  logger.debug({ count: duePayments.length }, 'Processing retry queue');

  for (const payment of duePayments) {
    const nextRetryCount = payment.retry_count + 1;
    updateFailedPaymentStatus(payment.id, 'retrying');

    const result = await whopClient.retryCharge({
      subscriptionId: payment.subscription_id,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      customerId: payment.customer_id
    });

    const timestamp = toIso(nowUtc());

    if (result.success) {
      markFailedPaymentRecovered(payment.id, timestamp);
      logRecoveryEvent({
        failedPaymentId: payment.id,
        eventType: 'retry_attempt',
        status: 'success',
        channel: undefined,
        details: {
          retryCount: nextRetryCount,
          message: result.message
        }
      });
      logger.info({ paymentId: payment.id }, 'Recovered failed payment');
      continue;
    }

    const reachedLimit = nextRetryCount >= MAX_RETRY_ATTEMPTS;
    const nextRetryAt = reachedLimit ? null : computeNextRetryAt({
      ...payment,
      retry_count: nextRetryCount
    });

    updateFailedPaymentAfterRetry(payment.id, {
      status: reachedLimit ? 'written_off' : 'engaging',
      retryCount: nextRetryCount,
      lastAttemptAt: timestamp,
      nextRetryAt
    });

    logRecoveryEvent({
      failedPaymentId: payment.id,
      eventType: 'retry_attempt',
      status: reachedLimit ? 'failure' : 'pending',
      channel: undefined,
      details: {
        retryCount: nextRetryCount,
        message: result.message,
        statusCode: result.status
      }
    });

    if (reachedLimit) {
      logger.warn({ paymentId: payment.id }, 'Max retry attempts reached, marking as written off');
    }
  }
};

export const startBackgroundWorkers = () => {
  setInterval(() => {
    processFollowUps().catch((err) => logger.error({ err }, 'Follow-up worker failure'));
  }, FOLLOW_UP_POLL_INTERVAL_MS);

  setInterval(() => {
    processRetryQueue().catch((err) => logger.error({ err }, 'Retry worker failure'));
  }, RETRY_POLL_INTERVAL_MS);

  logger.info('Background workers started');
};
