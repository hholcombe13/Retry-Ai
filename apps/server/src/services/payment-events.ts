import Stripe from 'stripe';
import { PaymentEventType, PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { discordBot } from '../bot/discordBot';

const fallbackCurrency = (invoice: Stripe.Invoice) => invoice.currency ?? 'usd';

const coerceAmountCents = (invoice: Stripe.Invoice) => invoice.amount_due ?? invoice.total ?? 0;

const serializeMetadata = (metadata: Stripe.Metadata | null | undefined) => {
  if (!metadata) return undefined;
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
};

const resolveCreator = (invoice: Stripe.Invoice) => {
  const creatorId = invoice.metadata?.creatorId || 'default-creator';
  const creatorName = invoice.metadata?.creatorName || 'Default Creator';
  const creatorEmail = invoice.metadata?.creatorEmail;
  return { creatorId, creatorName, creatorEmail };
};

const resolveCustomer = (invoice: Stripe.Invoice) => {
  const rawCustomer = invoice.customer;
  const customerId =
    typeof rawCustomer === 'string'
      ? rawCustomer
      : rawCustomer?.id || invoice.customer_email || `anon-${invoice.id}`;

  return {
    customerId,
    email: invoice.customer_email ?? undefined,
    name: invoice.customer_name ?? undefined,
    discordUserId: invoice.metadata?.discordUserId ?? undefined
  };
};

export const handleInvoicePaymentFailed = async (eventId: string, invoice: Stripe.Invoice) => {
  const { creatorId, creatorName, creatorEmail } = resolveCreator(invoice);
  const customer = resolveCustomer(invoice);
  const amountCents = coerceAmountCents(invoice);
  const currency = fallbackCurrency(invoice).toUpperCase();

  await prisma.creator.upsert({
    where: { id: creatorId },
    update: { name: creatorName, email: creatorEmail ?? undefined },
    create: { id: creatorId, name: creatorName, email: creatorEmail ?? undefined }
  });

  await prisma.customer.upsert({
    where: { id: customer.customerId },
    update: {
      email: customer.email,
      name: customer.name,
      discordUserId: customer.discordUserId
    },
    create: {
      id: customer.customerId,
      email: customer.email,
      name: customer.name,
      discordUserId: customer.discordUserId
    }
  });

  const payment = await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {
      creatorId,
      customerId: customer.customerId,
      stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
      amountCents,
      currency,
      status: PaymentStatus.FAILED,
      failureCode: invoice.last_payment_error?.code ?? undefined,
      failureMessage: invoice.last_payment_error?.message ?? undefined,
      metadata: serializeMetadata(invoice.metadata)
    },
    create: {
      stripeInvoiceId: invoice.id,
      stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
      creatorId,
      customerId: customer.customerId,
      amountCents,
      currency,
      status: PaymentStatus.FAILED,
      failureCode: invoice.last_payment_error?.code ?? undefined,
      failureMessage: invoice.last_payment_error?.message ?? undefined,
      metadata: serializeMetadata(invoice.metadata)
    }
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: PaymentEventType.STRIPE_PAYMENT_FAILED,
      externalEventId: eventId,
      metadata: {
        invoiceNumber: invoice.number,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        customerEmail: invoice.customer_email
      }
    }
  });

  if (customer.discordUserId) {
    try {
      await discordBot.sendDirectMessage(
        customer.discordUserId,
        `Hi ${customer.name ?? 'there'}! We couldn't process your payment of ${(amountCents / 100).toFixed(2)} ${currency}. Update your payment method to keep access.`
      );

      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id,
          type: PaymentEventType.DISCORD_DM,
          metadata: {
            userId: customer.discordUserId,
            message: 'Payment failure notice sent via Discord'
          }
        }
      });
    } catch (error) {
      logger.warn({ error, discordUserId: customer.discordUserId }, 'Failed to send Discord DM');
    }
  }
};

export const handleInvoicePaymentSucceeded = async (eventId: string, invoice: Stripe.Invoice) => {
  const amountCents = coerceAmountCents(invoice);
  const currency = fallbackCurrency(invoice).toUpperCase();

  const payment = await prisma.payment.update({
    where: { stripeInvoiceId: invoice.id },
    data: {
      status: PaymentStatus.RECOVERED,
      recoveredAt: new Date(),
      amountCents,
      currency,
      metadata: serializeMetadata(invoice.metadata)
    }
  }).catch((error) => {
    logger.warn({ invoiceId: invoice.id, error }, 'Recovered invoice missing payment record');
    return undefined;
  });

  if (!payment) {
    return;
  }

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: PaymentEventType.STRIPE_PAYMENT_SUCCEEDED,
      externalEventId: eventId,
      metadata: {
        invoiceNumber: invoice.number,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        amountCents,
        currency
      }
    }
  });
};
