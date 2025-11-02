export type FollowUpChannel = 'email' | 'sms' | 'discord';

export type FollowUpStatus = 'pending' | 'sent' | 'failed';

export type FailedPaymentStatus =
  | 'pending'
  | 'engaging'
  | 'retrying'
  | 'recovered'
  | 'written_off';

export interface CustomerContact {
  email?: string | null;
  phone?: string | null;
  discordId?: string | null;
  timezone?: string | null;
  preferredChannel?: FollowUpChannel | null;
}

export interface CreatorProfile {
  id: string;
  name: string;
  contactEmail?: string | null;
  timezone?: string | null;
}

export interface SubscriptionInfo {
  id: string;
  creatorId: string;
  customerId: string;
  planName: string;
  priceCents: number;
  currency: string;
  status: string;
  providerSubscriptionId?: string;
}

export interface FailedPaymentRecord {
  id: string;
  subscriptionId: string;
  creatorId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  failedAt: string;
  status: FailedPaymentStatus;
  retryCount: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  reason?: string | null;
  providerEventId?: string | null;
}

export interface FollowUpTaskRecord {
  id: string;
  failedPaymentId: string;
  channel: FollowUpChannel;
  templateId: string;
  status: FollowUpStatus;
  scheduledFor: string;
  sentAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecoveryEventRecord {
  id: string;
  failedPaymentId: string;
  eventType: 'follow_up' | 'retry_attempt' | 'status_change';
  channel?: FollowUpChannel | null;
  status: 'pending' | 'success' | 'failure';
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WhopWebhookEvent<T = unknown> {
  id: string;
  type: string;
  created_at: string;
  data: T;
}

export interface WhopFailedPaymentPayload {
  creator: {
    id: string;
    name: string;
    contact_email?: string | null;
    timezone?: string | null;
  };
  customer: {
    id: string;
    email?: string | null;
    phone?: string | null;
    discord_id?: string | null;
    timezone?: string | null;
    preferred_channel?: FollowUpChannel | null;
  };
  subscription: {
    id: string;
    plan_name: string;
    price_cents: number;
    currency: string;
    status: string;
    provider_subscription_id?: string;
  };
  payment: {
    amount_cents: number;
    currency: string;
    failed_at: string;
    reason?: string | null;
  };
}
