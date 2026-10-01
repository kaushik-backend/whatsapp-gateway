# WhatsApp API Gateway

Self-hosted WhatsApp API gateway for sending and receiving messages. Provides a REST API on top of WhatsApp Web, using Baileys.

## Features
- Multi-session management
- Send Text, Image, Document, Voice, and Reaction messages
- API Key based Authentication with scoping
- Webhook delivery with HMAC signatures and auto-retries
- Outbox pattern for reliable message delivery
- Built-in rate limiting and idempotency controls

## Quick Start (Docker Compose)

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in DB details
3. Run `docker-compose up -d`

## Manual Setup

1. Install Node.js (v20+) and PostgreSQL (v16+)
2. Run `npm install`
3. Configure `.env`
4. Run DB migrations: `npx sequelize-cli db:migrate`
5. Start server: `npm start`

## Configuration

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | API Port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DB_URL` | Postgres Connection URL | `postgres://postgres:postgres@localhost:5432/whatsapp_gateway` |
| `CORS_ORIGIN` | CORS Origin | `*` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |

## API Reference

### Sessions
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:id/qr` - Get QR code for authentication
- `DELETE /api/v1/sessions/:id` - Delete/logout session

### Messages
- `POST /api/v1/sessions/:sid/messages/text` - Send text message
- `POST /api/v1/sessions/:sid/messages/image` - Send image
- `POST /api/v1/sessions/:sid/messages/document` - Send document
- `POST /api/v1/sessions/:sid/messages/voice` - Send voice message
- `POST /api/v1/sessions/:sid/messages/react` - Send reaction
- `GET /api/v1/messages` - Query messages

### Webhooks
- `POST /api/v1/webhooks` - Register webhook
- `GET /api/v1/webhooks` - List webhooks
- `PUT /api/v1/webhooks/:id` - Update webhook
- `DELETE /api/v1/webhooks/:id` - Delete webhook

### API Keys
- `POST /api/v1/api-keys` - Generate API key
- `GET /api/v1/api-keys` - List API keys
- `DELETE /api/v1/api-keys/:id` - Revoke API key

## Authentication
Use the generated API key in the `X-API-Key` header.
Format: `prefix.random-key`

Scopes allow restricting API keys to specific operations (e.g., `messages:write`, `sessions:read`). You can also lock an API key to specific `sessionIds` or `chatJids`.

## Webhook Events
Events delivered to webhooks:
- `message.received`
- `message.status_update`
- `session.status_update`

Webhooks are signed using HMAC-SHA256 with your webhook secret. Verify by calculating the hash of the payload and comparing it with the `x-webhook-signature` header.

## Anti-Ban Safety
- Use idempotency keys to avoid duplicate sends
- Do not spam
- Avoid sending bulk messages rapidly
- Let users initiate conversations if possible

## Architecture
- Route → Controller → Service → Model
- Sequelize (PostgreSQL) for persistence
- Zod for payload validation
- Background processing for webhooks and reliable message outbox

## License
MIT
