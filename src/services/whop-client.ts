import { logger } from '../logger';

interface RetryChargeInput {
  subscriptionId: string;
  amountCents: number;
  currency: string;
  customerId: string;
}

interface RetryChargeResult {
  success: boolean;
  status: number;
  message: string;
}

/**
 * Minimal Whop API client wrapper. The implementation operates in "simulate" mode
 * unless a real API key is provided. Replace the simulated portions with actual
 * HTTP requests to Whop's REST API when credentials are available.
 */
export class WhopClient {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async retryCharge(input: RetryChargeInput): Promise<RetryChargeResult> {
    if (!this.apiKey) {
      // Simulation mode: apply a weighted random success chance
      const successChance = Math.min(0.7, 0.25 + input.amountCents / 10000);
      const success = Math.random() < successChance;
      const message = success
        ? 'Simulated retry success (no API key provided).'
        : 'Simulated retry failure (no API key provided).';
      logger[success ? 'info' : 'warn'](
        {
          subscriptionId: input.subscriptionId,
          amountCents: input.amountCents,
          currency: input.currency,
          customerId: input.customerId
        },
        message
      );
      return {
        success,
        status: success ? 200 : 400,
        message
      };
    }

    logger.info(
      {
        subscriptionId: input.subscriptionId,
        amountCents: input.amountCents,
        currency: input.currency,
        customerId: input.customerId
      },
      'Attempting Whop API retry (placeholder)'
    );

    // TODO: Integrate with Whop's subscription retry endpoint when available.
    return {
      success: false,
      status: 501,
      message: 'Whop retry integration not yet implemented.'
    };
  }
}

export const whopClient = new WhopClient(process.env.WHOP_API_KEY);
