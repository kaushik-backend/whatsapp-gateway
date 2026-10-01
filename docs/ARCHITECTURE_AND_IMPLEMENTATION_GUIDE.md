# WhatsApp API Gateway & AI Chat Support System
## Comprehensive Architecture, Implementation & Technology Decision Guide

---

## 1. Executive Summary & System Overview

This system is an enterprise-grade, self-hosted **WhatsApp API Gateway** with an integrated **AI Customer Support Engine** powered by **Google Gemini 1.5 Flash**, **LangChain JS**, and a **PostgreSQL vector (PGVector) Retrieval-Augmented Generation (RAG) pipeline**. 

The gateway bridges internal company microservices, CRM platforms, and automated AI agents with real WhatsApp accounts via WebSocket, providing:
- **Autonomous Outbox Queue**: Powered by PostgreSQL `FOR UPDATE SKIP LOCKED`.
- **Multi-Tier Anti-Ban Engine**: Enforces strict mathematical rate limits, human typing presence, recipient cooldowns, and cold-contact velocity throttling.
- **Multimodal Message Support**: Text, images, documents/PDFs, and microphone-recorded voice notes (PTT).
- **RAG Knowledge Base**: Auto-chunking and vector embeddings for `.pdf`, `.docx`, `.txt`, and `.md` documents with zero external vector database dependencies.
- **Signed Webhook Dispatcher**: HMAC-SHA256 authenticated event notifications with exponential backoff retries.

```mermaid
flowchart TB
    subgraph UI ["Client Tier (React 18 + Vite)"]
        Dashboard["Admin Dashboard"]
        MicRec["HTML5 Mic Voice Recorder"]
        RAGStudio["RAG Knowledge Studio"]
        SimCard["Customer Reply Simulator"]
    end

    subgraph API ["Gateway Tier (Express 5.0)"]
        AuthMiddleware["API Key & Scope Auth (SHA-256)"]
        MsgController["Message & Media Controllers"]
        UploadEngine["Multer File Streaming Engine"]
        RAGController["RAG & Ingestion Endpoints"]
    end

    subgraph QueueEngine ["Concurrency & Queue Engine"]
        OutboxTable[("outbox_jobs Table")]
        Worker["Per-Session SenderWorker"]
        AntiBan["Anti-Ban Gatekeeper"]
        Pacer["Human Jitter & Presence Simulator"]
    end

    subgraph RAGPipeline ["AI & Knowledge Tier"]
        LangChain["LangChain JS Pipeline"]
        Embedder["Google text-embedding-004"]
        GeminiFlash["Google Gemini 1.5 Flash (Free Tier)"]
        VectorStore[("knowledge_chunks (PGVector)")]
    end

    subgraph Storage ["Durable Storage Tier (PostgreSQL 16)"]
        SessionsTable[("sessions")]
        AuthStateTable[("auth_states (Baileys Signal Keys)")]
        MessagesTable[("messages")]
        WebhooksTable[("webhooks & deliveries")]
    end

    subgraph WA ["WhatsApp Network Tier"]
        Baileys["Baileys WebSocket Protocol"]
        MockProvider["MockProvider (Zero-Risk Sandbox)"]
    end

    UI --> API
    API --> Storage
    API --> OutboxTable
    OutboxTable -->|FOR UPDATE SKIP LOCKED| Worker
    Worker --> AntiBan
    AntiBan --> Pacer
    Pacer --> Baileys
    Baileys <--> WA
    
    Baileys -->|message.received| WebhooksTable
    WebhooksTable --> LangChain
    LangChain --> Embedder
    Embedder -->|Cosine Similarity| VectorStore
    VectorStore --> GeminiFlash
    GeminiFlash -->|Auto-Reply| OutboxTable
```

---

## 2. Deep Dive: Queue Engine & Concurrency Design
### Why PostgreSQL `FOR UPDATE SKIP LOCKED` Instead of BullMQ (Redis) or RabbitMQ

A central architectural decision in this gateway is using the **Transactional Outbox Pattern** implemented directly in PostgreSQL via `FOR UPDATE SKIP LOCKED`, rather than introducing external message brokers like BullMQ (Redis) or RabbitMQ.

```
┌────────────────────────────────────────────────────────────────────────┐
│ THE DUAL-WRITE ANOMALY (BullMQ / RabbitMQ)                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   HTTP POST /messages ───► [ 1. Write to Postgres ] (Success)          │
│                                  │                                     │
│                                  ▼ Network Flap / Redis OOM / Timeout  │
│                                                                        │
│                            [ 2. Push to Redis/RabbitMQ ] ──► 💥 Fails! │
│                                                                        │
│   Result: Message is saved in DB with status "queued", but the queue   │
│   broker never received the job. It becomes a ghost message forever.   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Comparative Matrix

| Criteria | PostgreSQL `SKIP LOCKED` (Chosen) | BullMQ (Redis) | RabbitMQ |
| :--- | :--- | :--- | :--- |
| **Dual-Write Consistency** | **100% ACID Guaranteed** (Single atomic transaction) | **Vulnerable to desync** (Two-phase write across network) | **Vulnerable to desync** (Two-phase write across network) |
| **Strict FIFO per Session** | **Native** (`WHERE sessionId = :id ORDER BY id ASC`) | Complex (Requires BullMQ Pro grouped jobs) | Complex (Requires single-active consumer per queue) |
| **Anti-Ban Multi-Hour Deferral**| **Native SQL** (`nextRetryAt = NOW() + cooldown`) | Memory-intensive ZSET delayed sets | Requires Dead Letter Exchanges (DLX) & per-message TTL |
| **Data Durability & Crash Recovery** | **WAL-backed on disk**; survives hard crashes (`kill -9`) | RAM-dependent; potential data loss if Redis restarts before fsync | Durable on disk if configured, but complex clustering required |
| **Operational Overhead** | **Zero additional infrastructure** (Postgres already running) | Requires Redis server, memory tuning, Sentinel/Cluster | Requires Erlang runtime, RabbitMQ daemon, cluster management |
| **Points of Failure** | **1 single system** (PostgreSQL) | **2 systems** (Postgres + Redis) | **2 systems** (Postgres + RabbitMQ) |
| **Inspection & Debugging** | Plain SQL query (`SELECT * FROM outbox_jobs`) | Redis CLI or dedicated Bull-Board UI | RabbitMQ Management HTTP UI |

---

### Core Principles of the PostgreSQL Outbox Engine

#### 1. Atomic Transactional Enqueueing
In [`src/services/message.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/message.service.js), every incoming message triggers a single database transaction:
```javascript
return await db.sequelize.transaction(async (t) => {
  const message = await db.Message.create({
    sessionId, chatJid, fromMe: true, type, body, status: 'queued', idempotencyKey
  }, { transaction: t });

  await outboxService.enqueue(sessionId, message.id, type, { text, to: chatJid }, t);
  return message;
});
```
If the database connection hiccups, both the message log and the queue job roll back together. There is zero possibility of an orphaned message record that never dispatches.

#### 2. The Non-Blocking Dequeue Query
In [`src/services/outbox.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/outbox.service.js), polling uses raw SQL with row-level locks:
```sql
UPDATE "outbox_jobs"
SET 
  status = 'processing',
  "lockedAt" = :now,
  "lockedBy" = :workerId
WHERE id = (
  SELECT id FROM "outbox_jobs"
  WHERE status = 'queued'
    AND "sessionId" = :sessionId
    AND "nextRetryAt" <= :now
  ORDER BY id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```
- **`FOR UPDATE`**: Locks the specific row so no other worker process can read or modify it.
- **`SKIP LOCKED`**: If a row is locked by another thread, the database instantly skips it without waiting and moves to the next eligible row.
- **`ORDER BY id ASC`**: Guarantees strict First-In, First-Out (FIFO) delivery order.
- **`"nextRetryAt" <= :now`**: Ignores jobs that are currently in an anti-ban cooling period or scheduled for future delivery.

#### 3. Native Cooldown Rescheduling (Zero-Memory Retention)
When an anti-ban threshold is triggered (e.g. per-minute cap reached or coffee-break burst pause required), the worker does **not** block a Node.js thread using `setTimeout` in memory. Instead, it reschedules the job in PostgreSQL:
```javascript
await outboxService.reschedule(job.id, canSend.retryAfterMs, canSend.reason);
```
This resets `status = 'queued'`, clears the lock, and sets `nextRetryAt = NOW() + retryAfterMs`. The worker is immediately free to handle other sessions or sleep cleanly.

---

## 3. Technology Stack Justifications & Comparative Analysis

| Technology Chosen | Evaluated Alternatives | Rationale & Decisive Advantages |
| :--- | :--- | :--- |
| **Node.js 20+ (ESM) + Express 5** | Python (FastAPI), Go (Gin/Fiber) | Baileys (the leading WhatsApp reverse-engineered library) is natively written in TypeScript/JavaScript for Node.js. Hosting the gateway in Python or Go would require inter-process RPC/gRPC bridges to Baileys, introducing serialization latency and memory duplication. Express 5 provides native Promise handling and modern routing. |
| **PostgreSQL 16 + pgvector** | Pinecone, Weaviate, Milvus, Qdrant | **Zero Data Silos**: Storing vector embeddings alongside relational auth states, sessions, and chat logs eliminates distributed synchronizations. pgvector delivers sub-10ms cosine similarity searches for knowledge bases up to 1M chunks with zero recurring SaaS costs. Includes native SQL cosine similarity fallback for environments without C-extensions. |
| **Google Gemini 1.5 Flash** | OpenAI GPT-4o, Claude 3.5 Sonnet, Local Llama 3 | **Cost & Latency**: Gemini 1.5 Flash offers an industry-leading free tier (15 RPM / 1,500 RPD / 1M TPM) with ultra-low latency (<600ms TTFT) and a massive 1-million-token context window. This enables feeding extensive documentation chunks without chunk-truncation penalties. |
| **LangChain JS (`@langchain/core`)** | LlamaIndex, Raw HTTP SDK calls | LangChain JS provides standardized document splitters (`RecursiveCharacterTextSplitter`), unified chat prompt templates, and direct interoperability with Google Generative AI embeddings and chat models. |
| **Baileys WebSocket Protocol** | Official WhatsApp Cloud API, Puppeteer (WA Web) | **No Recurring Conversation Fees & True Multi-Device**: Unlike Meta's Cloud API (which charges per 24h conversation window and requires Meta Business verification), Baileys connects via WhatsApp's native multi-device WebSocket protocol. Unlike Puppeteer/Selenium (which requires running headless Chromium consuming 1GB+ RAM per session), Baileys runs in lightweight pure-JS sockets consuming <40MB RAM per session. |
| **Vite + React 18 (Vanilla Dark CSS)** | Next.js, Tailwind CSS, Ant Design | **Zero Hydration Overhead & Sub-Second Builds**: A single-page dashboard for operational tooling benefits from Vite's native ES-module dev server (<100ms HMR) and fast build times (756ms). Eliminates bundle bloat from heavyweight component frameworks. |

---

## 4. Multi-Tier Anti-Ban Engine & Hard Rate Limiting

WhatsApp uses sophisticated behavioral heuristics to detect automated accounts. The gateway features a multi-tiered defense engine ([`src/services/antiBan.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/antiBan.service.js)) designed to protect linked phone numbers:

### Pacing Configuration Profiles

| Setting | Strict Mode (Default / Real Numbers) | Moderate Mode (Warmed-Up Numbers) | Relaxed Mode (Mock Sandbox) |
| :--- | :--- | :--- | :--- |
| **Max Messages / Minute** | **4 msgs/min** (Rolling 60s window) | 8 msgs/min | 30 msgs/min |
| **Hard Inter-Message Gap** | **5,000 ms** (Min 5s between any sends) | 3,000 ms | 500 ms |
| **Same-Recipient Cooldown** | **10,000 ms** (Min 10s before messaging same person) | 6,000 ms | 1,000 ms |
| **Cold Contact Velocity** | **Max 6 new contacts / hour** | Max 15 new contacts / hour | Max 100 new contacts / hour |
| **Burst Threshold** | **10 messages** | 18 messages | 50 messages |
| **Burst Break ("Coffee Break")**| **45s to 90s natural pause** | 25s to 50s natural pause | 5s to 10s pause |
| **Daily Warmup Limit** | **Day 1: 25 msgs** (+20% daily up to 300) | Day 1: 60 msgs (+20% daily up to 800) | 1,000 msgs/day |
| **Presence Simulation** | `composing` (1.5s - 3s) + 35-75ms/char typing | `composing` (1s - 2s) + 25-55ms/char typing | 300ms composing |

### The Human Simulation Pipeline
```
[ Job Dequeued ]
       │
       ▼
1. Presence: sendPresenceUpdate(jid, 'available')
       │ (waits 1.5s - 3.0s)
       ▼
2. Presence: sendPresenceUpdate(jid, 'composing')
       │ (waits textLength * random(35ms, 75ms), clamped between 2.5s and 9s)
       ▼
3. Dispatch: sendSocketMessage()
       │
       ▼
4. Post-Send Jitter: sleeps random(4.0s, 9.0s) before acknowledging worker
```

---

## 5. RAG Pipeline & AI Auto-Reply Chatbot Flow

The integrated customer support bot operates asynchronously without human intervention:

```
Customer WhatsApp Message
          │
          ▼
1. Baileys socket receives inbound payload
          │
          ▼
2. webhookService stores message (fromMe: false, status: 'delivered')
          │
          ▼
3. aiBotService evaluates guardrails:
   ├─ If fromMe == true ───────────────► Skip (never reply to self)
   ├─ If human agent replied in last 5m ─► Pause bot for this chat
   ├─ If > 5 bot replies in last 1 min ──► Rate limit throttle
   └─ If all checks pass ──────────────► Continue to RAG
          │
          ▼
4. ragService:
   ├─ Embeds query via Google 'text-embedding-004' (768-d vector)
   ├─ Executes Postgres cosine_similarity search on knowledge_chunks
   ├─ Retrieves top-K context snippets (similarity threshold > 0.05)
   ├─ Fetches last 6 conversation messages for multi-turn context
   └─ Calls Google Gemini 1.5 Flash via LangChain PromptTemplate
          │
          ▼
5. messageService.sendText(sessionId, chatJid, botAnswer)
          │
          ▼
6. Queued in outbox_jobs -> Dispatched via SenderWorker with typing indicator
```

---

## 6. Comprehensive API Reference & Usage Guide

### Base URL & Authentication
All API routes are prefixed with `/api/v1`. Authentication uses standard Bearer tokens:
```http
Authorization: Bearer <API_KEY>
```
*Bootstrap note: When zero API keys exist in the database, `POST /api/v1/api-keys` is open to generate your initial Master Admin Key.*

---

### A. Sessions Management

#### 1. Create Session
```http
POST /api/v1/sessions
Content-Type: application/json

{
  "id": "support-line-1",
  "name": "Customer Support WhatsApp"
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "support-line-1",
    "name": "Customer Support WhatsApp",
    "status": "starting"
  },
  "message": "Session created"
}
```

#### 2. Get QR Code for Pairing
- **HTML/Image View (Direct in Browser)**: `GET /api/v1/sessions/:id/qr?format=png`
- **JSON View**: `GET /api/v1/sessions/:id/qr?format=json`

#### 3. Simulate Inbound Customer Message (Zero-Ban Sandbox Testing)
```http
POST /api/v1/sessions/:id/simulate/incoming
Content-Type: application/json

{
  "fromPhone": "919876543210",
  "text": "How does authentication and QR code pairing work?"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "waMessageId": "3EB0_IN_1790788157346_XGQO",
    "chatJid": "919876543210@s.whatsapp.net",
    "text": "How does authentication and QR code pairing work?",
    "timestamp": 1790788157
  },
  "message": "Simulated customer message dispatched"
}
```

---

### B. Message Sending Endpoints

#### 1. Send Text Message
```http
POST /api/v1/sessions/:id/messages/text
Content-Type: application/json

{
  "to": "919876543210",
  "text": "Hello! Your support ticket #4102 has been resolved.",
  "idempotencyKey": "ticket-4102-resolved"
}
```
**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "id": 142,
    "status": "queued"
  },
  "message": "Message queued for sending"
}
```

#### 2. Send Voice Message via Microphone / File Upload
```http
POST /api/v1/sessions/:id/messages/voice/upload
Content-Type: multipart/form-data

file: <binary audio blob: .webm, .ogg, .mp3, .wav>
to: "919876543210"
idempotencyKey: "voice-note-991"
```
**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "id": 143,
    "status": "queued",
    "url": "/uploads/1790788157311-test_voice.webm"
  },
  "message": "Voice message uploaded and queued"
}
```

#### 3. Send Image via Upload
```http
POST /api/v1/sessions/:id/messages/image/upload
Content-Type: multipart/form-data

file: <binary image: .png, .jpg, .webp>
to: "919876543210"
caption: "Product catalog updated"
```

#### 4. Send Document / PDF via Upload
```http
POST /api/v1/sessions/:id/messages/document/upload
Content-Type: multipart/form-data

file: <binary document: .pdf, .docx, .txt>
to: "919876543210"
```

---

### C. RAG Knowledge Base & AI Chatbot Endpoints

#### 1. Ingest Knowledge Document
```http
POST /api/v1/rag/documents/upload
Content-Type: multipart/form-data

file: <binary document: .pdf, .docx, .txt, .md>
title: "Product Return & Warranty Policy 2026"
```
**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "7a3e2154-3c82-4f1e-9271-bf7512da5011",
    "title": "Product Return & Warranty Policy 2026",
    "filename": "warranty_policy.pdf",
    "mimeType": "application/pdf",
    "size": 184290,
    "totalChunks": 24
  },
  "message": "Document \"Product Return & Warranty Policy 2026\" indexed successfully with 24 chunks"
}
```

#### 2. Test RAG Query Directly
```http
POST /api/v1/rag/query
Content-Type: application/json

{
  "query": "What are the rules for returning a damaged item?",
  "topK": 3
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "answer": "Damaged items can be returned within 30 days of delivery with original packaging. Please provide photographic evidence upon submitting the return request.",
    "model": "gemini-1.5-flash",
    "isAiGenerated": true,
    "sources": [
      {
        "id": "chunk-uuid-1",
        "documentTitle": "Product Return & Warranty Policy 2026",
        "similarity": "0.894",
        "snippet": "Damaged goods must be reported within 30 days..."
      }
    ]
  },
  "message": "RAG response generated"
}
```

#### 3. Update AI Bot & Gemini Configuration
```http
POST /api/v1/rag/settings
Content-Type: application/json

{
  "apiKey": "AIzaSy...",
  "botEnabled": true,
  "sessionId": "global"
}
```

---

### D. Webhooks & Inbound Event Payload

When an inbound message arrives, subscribed URLs receive an HTTP POST request signed with HMAC-SHA256:

#### Webhook Headers:
- `X-Signature`: `sha256=5d41402abc4b2a76b9719d911017c592...`
- `X-Timestamp`: `1790788157`
- `Content-Type`: `application/json`

#### Inbound Event Payload:
```json
{
  "event": "message.received",
  "sessionId": "support-line-1",
  "message": {
    "id": 892,
    "sessionId": "support-line-1",
    "waMessageId": "3EB0_IN_1790788157",
    "chatJid": "919876543210@s.whatsapp.net",
    "fromMe": false,
    "type": "text",
    "body": {
      "text": "Can I return an opened box?"
    },
    "timestamp": 1790788157,
    "status": "delivered"
  }
}
```

#### Signature Verification (Receiver-Side Code):
```javascript
import crypto from 'crypto';

function verifyWebhook(req, secret) {
  const signature = req.headers['x-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## 7. Operational Runbook

### Environment Variables ([`.env`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/.env))
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://postgres:root@localhost:5432/whatsapp_gateway
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOG_LEVEL=debug

# Provider: 'baileys' (Real WhatsApp) or 'mock' (Zero-ban risk sandbox)
WA_PROVIDER=mock

# Anti-Ban Pacing Mode: 'strict', 'moderate', or 'relaxed'
ANTI_BAN_MODE=strict

# Google Gemini API Key for RAG Support Bot
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### Starting the Services
```bash
# 1. Run migrations
npm run migrate

# 2. Start Backend Server
npm run dev

# 3. Start React Dashboard
npm run client
```
Access the dashboard at `http://localhost:5173`.
