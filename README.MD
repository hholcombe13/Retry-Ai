# Retry.ai

Retry.ai helps Whop creators automatically recover failed subscription payments with intelligent retries, multichannel follow ups, and a real-time dashboard.

## Architecture

- **Frontend**: Next.js 14 + TypeScript (`apps/web`) renders the creator dashboard with recovered revenue and retry analytics.
- **Backend**: Node.js (Express) service (`apps/server`) handles Stripe webhooks, orchestrates Discord follow ups, and exposes REST endpoints for the dashboard.
- **Database**: PostgreSQL accessed via Prisma ORM (`prisma/schema.prisma`).
- **Integrations**:
  - **Stripe** webhook listener for `invoice.payment_failed` and `invoice.payment_succeeded` events.
  - **Discord bot** integration for direct-message reminders to subscribers.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and update the values:

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL`: PostgreSQL connection string.
   - `STRIPE_API_KEY`: Stripe secret key for server-side API calls.
   - `STRIPE_WEBHOOK_SECRET`: Webhook signing secret from the Stripe dashboard or CLI.
   - `DISCORD_BOT_TOKEN`: Bot token for sending DMs (optional in development).
   - `DASHBOARD_ORIGIN`: Allowed origin for CORS, typically `http://localhost:3000` during development.
   - `NEXT_PUBLIC_API_BASE_URL`: URL for the Express API consumed by Next.js.

3. **Provision the database**

   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```

4. **Run the dev servers**

   ```bash
   npm run dev
   ```

   - Next.js dashboard: http://localhost:3000
   - Express API & Stripe webhooks: http://localhost:4000

## Stripe webhook testing

Use the Stripe CLI to relay events to the local server once it is running:

```bash
stripe listen --events invoice.payment_failed,invoice.payment_succeeded --forward-to http://localhost:4000/webhooks/stripe
```

Trigger a failed invoice for testing:

```bash
stripe trigger invoice.payment_failed
```

Recovered events will update the dashboard instantly via the `/api/stats` endpoint.

## Discord integration

Set `DISCORD_BOT_TOKEN` and ensure the bot has the `message` intent enabled. When a Stripe invoice includes `discordUserId` in its metadata, the backend sends a DM notifying the subscriber of the failed payment.

## Available scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Runs Next.js and Express concurrently in development mode. |
| `npm run dev:web` | Starts only the Next.js dashboard. |
| `npm run dev:server` | Starts only the Express backend with file watching. |
| `npm run prisma:generate` | Regenerates the Prisma client. |
| `npm run prisma:migrate` | Applies the latest Prisma migrations. |

## Project structure

```
apps/
  web/      # Next.js dashboard (frontend)
  server/   # Express API + Stripe webhooks + Discord bot (backend)
prisma/     # Prisma schema and migrations
```

You're ready to connect Stripe, configure Discord, and start recovering revenue automatically.
