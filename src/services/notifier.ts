import { logger } from '../logger';
import { appConfig } from '../config';
import { FollowUpChannel, FollowUpTaskRecord } from '../domain/types';

interface ContactDetails {
  email?: string | null;
  phone?: string | null;
  discordId?: string | null;
  name?: string | null;
}

interface CreatorDetails {
  id: string;
  name: string;
  contactEmail?: string | null;
}

interface FailedPaymentSummary {
  amountCents: number;
  currency: string;
  planName?: string | null;
  failedAt: string;
  retryCount: number;
}

interface NotificationContext {
  creator: CreatorDetails;
  customer: ContactDetails;
  payment: FailedPaymentSummary;
  task: FollowUpTaskRecord;
}

interface NotificationResult {
  success: boolean;
  channel: FollowUpChannel;
  detail: string;
}

const formatCurrency = (amountCents: number, currency: string) => {
  const amount = (amountCents / 100).toFixed(2);
  return `${currency.toUpperCase()} ${amount}`;
};

const buildMessage = (context: NotificationContext) => {
  const amount = formatCurrency(context.payment.amountCents, context.payment.currency);
  const plan = context.payment.planName ? ` for ${context.payment.planName}` : '';
  const greeting = context.customer.name ? `Hey ${context.customer.name}` : 'Hey there';
  const baseBody = `${greeting}, your subscription payment${plan} was unsuccessful. You can update your payment method to keep access.`;
  return {
    subject: `Action needed: Update payment for ${context.creator.name}`,
    body: `${baseBody} If you have questions reply to this message.`,
    sms: `${greeting}! Your payment of ${amount}${plan} failed. Update your card to keep access: <payment link>`,
    discord: `${greeting}, we couldn't process your ${amount}${plan} payment. Tap here to update your card: <payment link>`
  };
};

const sendEmail = async (context: NotificationContext) => {
  if (!context.customer.email) {
    return { success: false, channel: 'email' as const, detail: 'Missing customer email' };
  }
  const message = buildMessage(context);
  logger.info(
    {
      to: context.customer.email,
      from: appConfig.followUpFromEmail,
      subject: message.subject
    },
    'Sending email follow-up (simulated)'
  );
  return { success: true, channel: 'email' as const, detail: 'Email dispatched (console provider)' };
};

const sendSms = async (context: NotificationContext) => {
  if (!context.customer.phone) {
    return { success: false, channel: 'sms' as const, detail: 'Missing customer phone' };
  }
  const message = buildMessage(context);
  logger.info(
    {
      to: context.customer.phone,
      body: message.sms
    },
    'Sending SMS follow-up (simulated)'
  );
  return { success: true, channel: 'sms' as const, detail: 'SMS dispatched (console provider)' };
};

const sendDiscord = async (context: NotificationContext) => {
  if (!context.customer.discordId) {
    return { success: false, channel: 'discord' as const, detail: 'Missing Discord account' };
  }
  const message = buildMessage(context);
  logger.info(
    {
      to: context.customer.discordId,
      body: message.discord
    },
    'Sending Discord DM follow-up (simulated)'
  );
  return { success: true, channel: 'discord' as const, detail: 'Discord DM dispatched (console provider)' };
};

export class NotifierService {
  async send(context: NotificationContext): Promise<NotificationResult> {
    switch (context.task.channel) {
      case 'email':
        return sendEmail(context);
      case 'sms':
        return sendSms(context);
      case 'discord':
        return sendDiscord(context);
      default:
        return {
          success: false,
          channel: context.task.channel,
          detail: `Unsupported channel ${context.task.channel}`
        };
    }
  }
}

export const notifierService = new NotifierService();
