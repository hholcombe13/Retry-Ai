import { Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../env';
import { logger } from '../logger';
import {
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded
} from '../services/payment-events';

const stripe = new Stripe(env.STRIPE_API_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20'
});

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe webhook secret is not configured');
    return res.status(500).send('Stripe webhook secret not configured');
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing Stripe signature header');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed to construct Stripe event');
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  try {
    switch (event.type) {
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.id, event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.id, event.data.object as Stripe.Invoice);
        break;
      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe event type');
    }
  } catch (error) {
    logger.error({ error, eventId: event.id, type: event.type }, 'Stripe webhook handler error');
    return res.status(500).send('Failed to process event');
  }

  res.json({ received: true });
};
