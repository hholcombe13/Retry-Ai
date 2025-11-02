import { addHours, addMinutes, toIso } from '../utils/time';
import { FailedPaymentRecord, FollowUpChannel } from '../domain/types';

interface CustomerProfile {
  email?: string | null;
  phone?: string | null;
  discordId?: string | null;
  preferredChannel?: FollowUpChannel | null;
}

interface SubscriptionSnapshot {
  planName?: string | null;
}

interface FollowUpPlanInput {
  failedPayment: FailedPaymentRecord;
  customer: CustomerProfile;
  subscription: SubscriptionSnapshot;
}

interface FollowUpTaskPlan {
  channel: FollowUpChannel;
  templateId: string;
  scheduledFor: string;
  metadata?: Record<string, unknown>;
}

const defaultDelaysMinutes: Record<FollowUpChannel, number> = {
  email: 15,
  sms: 360,
  discord: 1440
};

const hasContactForChannel = (customer: CustomerProfile, channel: FollowUpChannel) => {
  switch (channel) {
    case 'email':
      return Boolean(customer.email);
    case 'sms':
      return Boolean(customer.phone);
    case 'discord':
      return Boolean(customer.discordId);
    default:
      return false;
  }
};

const escalateDelayMinutes = (baseMinutes: number, retryCount: number) => {
  if (retryCount === 0) return baseMinutes;
  const factor = Math.min(3, 1 + retryCount * 0.5);
  return Math.round(baseMinutes * factor);
};

export const buildFollowUpPlan = (input: FollowUpPlanInput): FollowUpTaskPlan[] => {
  const { failedPayment, customer } = input;
  const planned: FollowUpTaskPlan[] = [];
  const now = new Date();
  const channels: FollowUpChannel[] = [];

  const addChannelIfSupported = (channel: FollowUpChannel, available: boolean) => {
    if (!available) return;
    if (!channels.includes(channel)) channels.push(channel);
  };

  if (customer.preferredChannel) {
    addChannelIfSupported(customer.preferredChannel, hasContactForChannel(customer, customer.preferredChannel));
  }

  addChannelIfSupported('email', hasContactForChannel(customer, 'email'));
  addChannelIfSupported('sms', hasContactForChannel(customer, 'sms'));
  addChannelIfSupported('discord', hasContactForChannel(customer, 'discord'));

  channels.forEach((channel, index) => {
    const baseDelay = defaultDelaysMinutes[channel];
    const delay = escalateDelayMinutes(baseDelay + index * 30, failedPayment.retryCount);
    const scheduledFor = toIso(addMinutes(now, delay));
    planned.push({
      channel,
      templateId: `followup_${channel}_v1`,
      scheduledFor,
      metadata: {
        planName: input.subscription.planName,
        retryCount: failedPayment.retryCount,
        preferred: customer.preferredChannel === channel
      }
    });
  });

  return planned;
};

export const computeNextRetryAt = (failedPayment: FailedPaymentRecord): string => {
  const baseScheduleHours = [1, 12, 24, 48, 72];
  const index = Math.min(failedPayment.retryCount, baseScheduleHours.length - 1);
  const delayHours = baseScheduleHours[index];
  return toIso(addHours(new Date(), delayHours));
};
