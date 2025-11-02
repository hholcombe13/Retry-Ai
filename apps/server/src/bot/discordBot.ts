import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { env } from '../env';
import { logger } from '../logger';

class DiscordBot {
  private client?: Client;
  private ready = false;

  constructor(private token?: string) {}

  private async ensureClient() {
    if (!this.token) {
      throw new Error('DISCORD_BOT_TOKEN is not configured');
    }

    if (this.client && this.ready) {
      return this.client;
    }

    if (!this.client) {
      this.client = new Client({
        intents: [GatewayIntentBits.DirectMessages],
        partials: [Partials.Channel]
      });

      this.client.on('ready', () => {
        this.ready = true;
        logger.info('Discord bot ready');
      });

      this.client.on('error', (error) => {
        logger.error({ error }, 'Discord bot error');
      });

      try {
        await this.client.login(this.token);
      } catch (error) {
        logger.error({ error }, 'Failed to initialise Discord bot');
        throw error;
      }
    }

    return this.client;
  }

  async sendDirectMessage(userId: string, message: string) {
    if (!this.token) {
      logger.debug('Discord bot token not configured; skipping DM');
      return;
    }

    const client = await this.ensureClient();
    try {
      const user = await client.users.fetch(userId);
      await user.send({ content: message });
      logger.info({ userId }, 'Discord DM sent');
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to send Discord DM');
      throw error;
    }
  }
}

export const discordBot = new DiscordBot(env.DISCORD_BOT_TOKEN);
