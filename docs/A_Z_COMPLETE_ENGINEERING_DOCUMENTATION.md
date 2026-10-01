# WhatsApp API Gateway & AI Chat Support Platform
# Complete A-to-Z Engineering Master Documentation

> **Document Version:** 3.0.0 (Enterprise Architectural Standard)  
> **Status:** Production-Ready  
> **Target Audience:** Principal Architects, Staff Engineers, Security Auditors, DevOps & Lead Developers  

---

## Table of Contents
1. [Executive Summary & High-Level Topology](#1-executive-summary--high-level-topology)
2. [Database Architecture & Data Models (PostgreSQL)](#2-database-architecture--data-models-postgresql)
3. [The Concurrency & Outbox Queue Engine (The SKIP LOCKED Architecture)](#3-the-concurrency--outbox-queue-engine-the-skip-locked-architecture)
4. [WhatsApp Driver Layer: Baileys vs. Alternatives](#4-whatsapp-driver-layer-baileys-vs-alternatives)
5. [The Multi-Tier Anti-Ban Engine & Behavioral Pacing](#5-the-multi-tier-anti-ban-engine--behavioral-pacing)
6. [The RAG Knowledge Pipeline & AI Support Bot](#6-the-rag-knowledge-pipeline--ai-support-bot)
7. [Networking, Webhooks & Communications: Why Not Socket.io?](#7-networking-webhooks--communications-why-not-socketio)
8. [Frontend Client Architecture (Vite + React 18)](#8-frontend-client-architecture-vite--react-18)
9. [Enterprise Security & Access Control](#9-enterprise-security--access-control)
10. [End-to-End System Flows (Step-by-Step Executions)](#10-end-to-end-system-flows-step-by-step-executions)
11. [Complete REST & Webhook API Reference](#11-complete-rest--webhook-api-reference)
12. [Operational Runbook, Resilience & Production Deployment](#12-operational-runbook-resilience--production-deployment)

---

## 1. Executive Summary & High-Level Topology

The **WhatsApp API Gateway** is an asynchronous, self-hosted communication bridge that provides enterprise microservices, CRMs, and automated AI agents with reliable, ban-safe programmatic access to WhatsApp. 

It addresses three fundamental challenges in WhatsApp automation:
1. **Connection Fragility**: Managing persistent multi-device WebSocket sessions that survive server redeployments without physical QR re-scans.
2. **Account Longevity (Anti-Ban)**: Preventing automated account suspensions by enforcing human behavioral simulation, natural typing cadence, and multi-tiered rate limiting.
3. **Autonomous Customer Intelligence**: Providing instant, documentation-grounded customer service via a Retrieval-Augmented Generation (RAG) pipeline utilizing **Google Gemini 1.5 Flash**, **LangChain JS**, and **PostgreSQL vector embeddings**.

### System Architecture Topology

```mermaid
flowchart TB
    subgraph UI ["Client Tier (React 18 + Vite)"]
        Dashboard["Admin Dashboard"]
        MicRec["HTML5 Mic Voice Recorder (PTT)"]
        MediaComp["Multimodal File Composer"]
        RAGStudio["RAG Knowledge Studio"]
        SimCard["Customer Reply Simulator"]
    end

    subgraph API ["Gateway Tier (Express 5.0 ESM)"]
        AuthMiddleware["API Key & Scope Auth (SHA-256)"]
        RateLimiter["Rate Limiting Middleware"]
        MsgController["Message & Media Controllers"]
        UploadEngine["Multer File Streaming Engine (/uploads)"]
        RAGController["RAG & Ingestion Endpoints"]
    end

    subgraph QueueEngine ["Concurrency & Queue Engine"]
        OutboxTable[("outbox_jobs Table")]
        Worker["Per-Session SenderWorker Loop"]
        AntiBan["Anti-Ban Gatekeeper"]
        Pacer["Human Jitter & Presence Simulator"]
    end

    subgraph RAGPipeline ["AI & Knowledge Tier"]
        LangChain["LangChain JS Pipeline"]
        Embedder["Google text-embedding-004"]
        GeminiFlash["Google Gemini 1.5 Flash (Free Tier)"]
        VectorStore[("knowledge_chunks (PGVector / Cosine Fallback)")]
    end

    subgraph Storage ["Durable Storage Tier (PostgreSQL 16)"]
        SessionsTable[("sessions")]
        AuthStateTable[("auth_states (Baileys Signal Keys)")]
        MessagesTable[("messages")]
        WebhooksTable[("webhooks & deliveries")]
    end

    subgraph WANetwork ["WhatsApp Network Tier"]
        Baileys["Baileys WebSocket Protocol (Noise Protocol)"]
        MockProvider["MockProvider (Zero-Risk Sandbox)"]
    end

    UI -->|REST API Requests| API
    API --> Storage
    API --> OutboxTable
    OutboxTable -->|FOR UPDATE SKIP LOCKED| Worker
    Worker --> AntiBan
    AntiBan --> Pacer
    Pacer --> Baileys
    Baileys <--> WANetwork
    
    Baileys -->|message.received| WebhooksTable
    WebhooksTable --> LangChain
    LangChain --> Embedder
    Embedder -->|Cosine Similarity Search| VectorStore
    VectorStore --> GeminiFlash
    GeminiFlash -->|Auto-Reply| OutboxTable
```

---

## 2. Database Architecture & Data Models (PostgreSQL)

### Why PostgreSQL 16 Was Chosen Over MongoDB, MySQL, or DynamoDB

| Architectural Requirement | PostgreSQL 16 (Chosen) | MongoDB | MySQL 8 | DynamoDB |
| :--- | :--- | :--- | :--- | :--- |
| **ACID Transactional Outbox** | **Native**: Atomic transaction across messages and queue jobs. | Multi-document transactions are slow and resource-heavy. | Supported (InnoDB), but lacks native `SKIP LOCKED` tuning. | No multi-table atomic transactions without costly DynamoDB Transactions. |
| **Vector Storage (RAG)** | **Built-in (`pgvector`)**: 768-d embeddings alongside relational data. | Requires MongoDB Atlas Vector Search (paid cloud lock-in). | No native vector support. Requires external vector plugin. | Requires Amazon OpenSearch or Kendra integration. |
| **Row-Level Concurrency** | **`FOR UPDATE SKIP LOCKED`**: Non-blocking concurrent job dequeue. | Relies on optimistic concurrency (`findAndModify`), causing write conflicts. | `SKIP LOCKED` present in MySQL 8, but lacks partial indexes. | No row-locking queue mechanism; requires SQS. |
| **Cryptographic Auth States** | **Binary JSON / JSONB**: Stores Baileys Signal keys efficiently. | Supported, but relational joins to sessions are absent. | Supported via JSON type. | Size limits (400KB per item) can truncate large key shares. |

### Schema & Entity Relationships

The relational schema consists of 9 core tables:

```mermaid
erDiagram
    sessions ||--o{ auth_states : "maintains keys"
    sessions ||--o{ messages : "records"
    sessions ||--o{ outbox_jobs : "queues"
    sessions ||--o{ webhooks : "configures"
    webhooks ||--o{ webhook_deliveries : "dispatches"
    knowledge_documents ||--o{ knowledge_chunks : "chunks into vectors"

    sessions {
        string id PK
        string name
        enum status
        string phoneNumber
        timestamp createdAt
    }

    auth_states {
        string sessionId FK
        string type
        string key
        jsonb value
    }

    messages {
        int id PK
        string sessionId FK
        string waMessageId
        string chatJid
        boolean fromMe
        enum type
        jsonb body
        enum status
        string idempotencyKey
        timestamp createdAt
    }

    outbox_jobs {
        int id PK
        string sessionId FK
        int messageId FK
        string type
        jsonb payload
        enum status
        int attempts
        timestamp nextRetryAt
        timestamp lockedAt
        string lockedBy
    }

    knowledge_documents {
        uuid id PK
        string filename
        string title
        string mimeType
        int totalChunks
    }

    knowledge_chunks {
        uuid id PK
        uuid documentId FK
        text content
        float_array embedding
    }
```

---

## 3. The Concurrency & Outbox Queue Engine (The SKIP LOCKED Architecture)

### The Architectural Dilemma: PostgreSQL Outbox vs. BullMQ vs. RabbitMQ vs. Apache Kafka

A critical design requirement for a WhatsApp Gateway is **guaranteeing that every message queued is sent exactly once, in order, without account-banning socket collisions**. 

Below is an exhaustive comparison of queue strategies:

| Vector | PostgreSQL Outbox (`SKIP LOCKED`) | BullMQ (Redis) | RabbitMQ (AMQP) | Apache Kafka |
| :--- | :--- | :--- | :--- | :--- |
| **Dual-Write Hazard** | **None (0%)**: Written in the same atomic SQL commit. | **High Risk**: If Redis fails after SQL insert, message is orphaned. | **High Risk**: Distributed transaction required to prevent desync. | **Extreme Risk**: Dual-write anomaly requires complex Debezium CDC. |
| **Strict FIFO per Session** | **Native**: `WHERE sessionId = :id ORDER BY id ASC`. | Requires BullMQ Pro grouped keys or dynamic queues per number. | Requires single-active consumer per queue. | Partition key by sessionId, but head-of-line blocking stalls partitions. |
| **Anti-Ban Rescheduling** | **Trivial**: Update `nextRetryAt = NOW() + cooldown`. | Retains delayed jobs in Redis RAM ZSETs. | Requires DLX (Dead Letter Exchange) and TTL tricks. | Does not support variable per-message delay scheduling. |
| **Memory Footprint** | **Zero additional RAM**: Sits on disk until processed. | High RAM consumption (all job payloads reside in memory). | Moderate RAM consumption (retains queues in Erlang broker). | High RAM & disk overhead (designed for gigabyte stream retention). |
| **Infrastructure Stack** | 1 single database engine (PostgreSQL). | 2 engines (Postgres + Redis Cluster). | 2 engines (Postgres + RabbitMQ + Erlang). | 3 engines (Postgres + Kafka + ZooKeeper/KRaft). |

### Mathematical Breakdown of the Dual-Write Bug
Suppose an external broker (BullMQ or RabbitMQ) is used:
1. Client issues `POST /messages`.
2. Step 1: `await db.Message.create({ id: 991, status: 'queued' })` &rarr; Success in 4ms.
3. Step 2: `await queue.publish({ messageId: 991 })` &rarr; Network socket timeout or Redis OOM crash.
4. **Failure State**: Message `991` exists in the database marked `'queued'`. The client received an error or success, but the background worker will **never** receive the job. The message is permanently lost.

In our implementation ([`src/services/message.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/message.service.js)):
```javascript
return await db.sequelize.transaction(async (t) => {
  const message = await db.Message.create({
    sessionId, chatJid, fromMe: true, type, body, status: 'queued', idempotencyKey
  }, { transaction: t });

  await outboxService.enqueue(sessionId, message.id, type, { text, to: chatJid }, t);
  return message;
});
```
Because PostgreSQL executes write-ahead logging (WAL), both inserts succeed atomically or both fail atomically. **Data loss is mathematically impossible.**

### The Dequeue Implementation
In [`src/services/outbox.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/outbox.service.js):
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
- **`FOR UPDATE`**: Locks the specific row at the storage engine level.
- **`SKIP LOCKED`**: Prevents worker contention. If another worker thread is inspecting a row, the engine skips it without waiting.
- **Single-Stream Guarantee**: By filtering `sessionId = :sessionId` and locking `LIMIT 1`, exactly **one worker at a time** interacts with a WhatsApp account, preventing multi-threaded socket collisions that trigger WhatsApp spam detections.

---

## 4. WhatsApp Driver Layer: Baileys vs. Alternatives

### Technology Comparative Analysis

| Solution | Mechanism | Cost per Message | Memory Usage | Ban Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Baileys (Chosen)** | Native Multi-Device WebSocket (Noise Protocol) | **$0.00 (Free)** | **~35 MB per session** | Low (with our anti-ban pacing) |
| **WhatsApp Cloud API (Meta)** | Official HTTP Cloud Endpoints | $0.03–$0.08 per 24h conversation | Negligible (Cloud API) | Zero (Official, but strict template approvals) |
| **Puppeteer / Selenium** | Headless Chrome running WhatsApp Web | $0.00 (Free) | **800 MB–1.5 GB per session** | Extremely High (Canvas fingerprinting detects Chrome) |
| **WPPConnect / Venom** | Chromium JS Injection wrapper | $0.00 (Free) | 700 MB–1.2 GB per session | High (Prone to DOM changes & Chrome memory leaks) |

### Why Baileys Was Chosen
1. **Low Resource Footprint**: Baileys executes pure JavaScript binary parsing of WhatsApp's Protobuf protocols. It does not spawn a browser, allowing hundreds of sessions to run on a modest 4GB RAM server.
2. **PostgreSQL Signal Auth Adapter**: WhatsApp multi-device authentication uses Signal protocol keys (identity keys, pre-keys, signed keys). Instead of writing thousands of small `.json` files to disk (which causes file lock errors in Docker containers), our custom adapter ([`src/services/session.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/session.service.js#L132-L203)) synchronizes keys directly into the `auth_states` table in PostgreSQL. When the server restarts or relocates to another container, sessions restore immediately without scanning a new QR code.

---

## 5. The Multi-Tier Anti-Ban Engine & Behavioral Pacing

WhatsApp accounts are banned when automated systems exhibit non-human behavior (sending hundreds of messages per minute, messaging uncontacted users at high velocity, or lacking typing presence). 

Our anti-ban architecture ([`src/services/antiBan.service.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/services/antiBan.service.js)) implements a 6-stage mathematical defense:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 6-STAGE ANTI-BAN GATEKEEPER                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Daily Limit Cap           --> Day 1: 25 msgs (+20% daily scaling)   │
│ 2. Minimum Inter-Message Gap --> 5.0 seconds hard hardware cooldown   │
│ 3. Same-Recipient Cooldown   --> 10.0 seconds minimum between same JID │
│ 4. Rolling 60s Rate Limit    --> Max 4 messages per 60 seconds         │
│ 5. Cold Contact Limiter      --> Max 6 new uncontacted numbers / hour  │
│ 6. Natural Burst Pauses      --> 45s-90s "Coffee Break" after 10 msgs  │
└────────────────────────────────────────────────────────────────────────┘
```

### Profile Specifications

| Enforcement Parameter | Strict Mode (Default for Real Numbers) | Moderate Mode (Warmed-Up) | Relaxed Mode (Mock Sandbox) |
| :--- | :--- | :--- | :--- |
| **Max Rolling Rate** | **4 messages / 60 seconds** | 8 messages / 60 seconds | 30 messages / 60 seconds |
| **Hardware Minimum Gap** | **5,000 ms** | 3,000 ms | 500 ms |
| **Recipient Cooldown** | **10,000 ms** | 6,000 ms | 1,000 ms |
| **Cold Contact Velocity** | **Max 6 new contacts / hour** | Max 15 new contacts / hour | Max 100 new contacts / hour |
| **Burst Break Threshold** | **Every 10 messages** | Every 18 messages | Every 50 messages |
| **Burst Pause Duration** | **45 to 90 seconds** | 25 to 50 seconds | 5 to 10 seconds |
| **Daily Warmup Limit** | **Day 1: 25 msgs** (+20% daily up to 300) | Day 1: 60 msgs (+20% daily up to 800) | 1,000 msgs/day |
| **Presence Emulation** | `composing` indicator + 35–75ms/char | `composing` indicator + 25–55ms/char | 300ms static |

---

## 6. The RAG Knowledge Pipeline & AI Support Bot

### Technology Rationale: Google Gemini 1.5 Flash + LangChain JS

- **Model Choice**: Google Gemini 1.5 Flash offers a completely free tier (15 requests/min, 1,500 requests/day, 1M tokens/min) with sub-600ms latency. Its 1-million-token context window allows feeding extensive documentation chunks without truncation penalties.
- **Embedding Model**: Google's `text-embedding-004` generates dense 768-dimensional vector representations.
- **In-Database Vector Cosine Similarity**: Instead of routing queries to external SaaS databases (like Pinecone), similarity search executes inside PostgreSQL using our optimized cosine distance SQL query:
  $$\text{Cosine Similarity}(A, B) = \frac{A \cdot B}{\|A\| \|B\|} = \frac{\sum_{i=1}^n A_i B_i}{\sqrt{\sum_{i=1}^n A_i^2} \sqrt{\sum_{i=1}^n B_i^2}}$$

### AI Bot Customer Support Loop
1. Inbound WhatsApp message arrives (`fromMe: false`).
2. **Safety Guardrails Checked**:
   - Filter self-messages (`fromMe === true`).
   - Human operator pause: If a human agent messaged this chat within the last 5 minutes, the bot pauses to prevent talking over human agents.
   - Rate limit: Capped at 5 bot replies per minute per chat.
3. **Retrieval**: Query is converted into a 768-d vector embedding &rarr; Top 4 matching chunks retrieved from `knowledge_chunks` table &rarr; Recent 6 chat history messages prepended.
4. **Synthesis**: LangChain prompt instructs Gemini 1.5 Flash to respond strictly based on retrieved company documentation with concise, friendly WhatsApp formatting (`*bold*`, bullet points).
5. **Dispatch**: Generated answer is enqueued into `outbox_jobs` &rarr; Sender worker shows typing indicator &rarr; Delivers to customer WhatsApp!

---

## 7. Networking, Webhooks & Communications: Why Not Socket.io?

### Why Socket.io Is Not Used for Core Gateway Operations

1. **Protocol Incompatibility with WhatsApp**: WhatsApp Web servers communicate via binary WebSockets using the **Noise Protocol** (cryptographic Signal handshake). Socket.io is an opinionated application-layer framework with custom framing that cannot talk to WhatsApp's native servers.
2. **Webhooks Are the Enterprise Standard for Backend Systems**: External microservices, CRMs, and serverless architectures (AWS Lambda, Google Cloud Run) cannot maintain persistent Socket.io connections. They require signed HTTP POST webhooks (`POST /webhook`) that can be authenticated via cryptographic signatures.
3. **Frontend Simplicity**: The admin dashboard utilizes standard REST APIs with interval polling (10s), ensuring the dashboard works behind strict corporate proxies without WebSocket upgrade failures.

### Webhook Security: HMAC-SHA256 Signing
All dispatched webhooks contain an `X-Signature` header computed as:
$$\text{Signature} = \text{HMAC-SHA256}(\text{payload\_body}, \text{webhook\_secret})$$

Receiver-side verification in Node.js:
```javascript
import crypto from 'crypto';

function verifyWebhook(rawBody, secret, signatureHeader) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

---

## 8. Frontend Client Architecture (Vite + React 18)

- **Build Engine**: Vite provides sub-100ms Hot Module Replacement (HMR) and an optimized 756ms production build (`npm run client:build`).
- **Styling**: Uses pure modular CSS variables with a WhatsApp-themed dark mode (`--bg-primary: #0b141a`, `--accent-wa: #25d366`), eliminating the CSS runtime overhead of Emotion or Styled-Components.
- **Audio Voice Recorder**: Uses the native HTML5 `MediaRecorder` API:
  - Captures microphone audio streams at 48kHz.
  - Generates standard `audio/webm` blobs.
  - Direct multipart streaming to `POST /api/v1/sessions/:id/messages/voice/upload`.
  - Dispatches as true WhatsApp Push-to-Talk (PTT) voice notes with playback scrubber.

---

## 9. Enterprise Security & Access Control

1. **API Key Hashing**: Plaintext API keys (`wag_live_...`) are displayed to the user once upon creation. Only their cryptographic SHA-256 hash is persisted in the `api_keys` table.
2. **Granular Scopes**: API keys are restricted to specific actions: `send`, `read`, `voice`, and `admin`.
3. **Chat-Level Permission Isolation**: Keys can be locked to specific customer phone numbers (`chatJids`). If an application with a restricted key attempts to message an unauthorized number, the gateway returns `HTTP 403 Forbidden`.
4. **Helmet & Cross-Origin Resource Policy**: Configured with `crossOriginResourcePolicy: { policy: "cross-origin" }` to allow authenticated streaming of local voice recordings and images to dashboard browsers while preventing cross-site scripting (XSS).

---

## 10. End-to-End System Flows (Step-by-Step Executions)

### Flow 1: Outbound Message Lifecycle
```
[Client / API]
       │
       ▼ 1. POST /api/v1/sessions/:id/messages/text
[messageService]
       │
       ▼ 2. BEGIN SQL Transaction
       ├─ Insert into messages (status: 'queued')
       ├─ Insert into outbox_jobs (status: 'queued', nextRetryAt: NOW())
       ▼ 3. COMMIT SQL Transaction
[Client] ◄─── Returns HTTP 202 Accepted { id: 104, status: 'queued' }
       │
       ▼ (Asynchronous)
[SenderWorker]
       │
       ▼ 4. outboxService.dequeue() via 'FOR UPDATE SKIP LOCKED'
## 10. End-to-End System Flows & Step-by-Step Working Mechanism

This section explains the exact step-by-step execution path of the system across its six primary operational sub-systems:

---

### Step-by-Step Mechanism 1: Server Bootup & Auto-Restoration
```
[Node.js Boot] ──> [1. Connect Postgres] ──> [2. Verify Migrations] ──> [3. Restore Sessions]
                         │
                         ├──> [4. Load Signal Keys from DB] ──> [5. Connect Baileys Sockets]
                         ├──> [6. Start Outbox SenderWorkers] ──> [7. Start Watchdog (30s)]
                         ├──> [8. Auto-Seed RAG Knowledge Base (Embed 768-D Vectors)]
                         └──> [9. Express HTTP Server Listening on PORT 3000]
```

1. **Database Authentication:** Node.js executes `db.sequelize.authenticate()` verifying pool connectivity to PostgreSQL 16.
2. **Migration & Model Verification:** Confirms all 9 tables exist (`sessions`, `auth_states`, `api_keys`, `messages`, `outbox_jobs`, `webhooks`, `webhook_deliveries`, `knowledge_documents`, `knowledge_chunks`).
3. **Session Querying:** `sessionService.restore()` queries all sessions in `starting`, `qr`, `connected`, or `reconnecting` states.
4. **Cryptographic Key Hydration:** For each session, our PostgreSQL auth adapter reads stored identity keys, pre-keys, and app-state sync keys from `auth_states` using `BufferJSON.reviver`.
5. **Staggered Socket Startup:** Initializes Baileys instances staggered **1.5 seconds apart** to prevent socket connection spikes to WhatsApp servers.
6. **Worker Spawning:** Spawns an independent `senderWorker` asynchronous loop for each active session.
7. **Watchdog Activation:** Starts a 30-second recurring timer (`src/workers/watchdog.js`) inspecting socket health and readyState.
8. **RAG Knowledge Auto-Seed:** `ragService.autoSeedInitialDocs()` checks if `knowledge_documents` contains records. If empty, it reads the gateway specification file, chunks the text into ~700-character segments, calculates 768-dimensional embeddings via Google `text-embedding-004`, and indexes them in PostgreSQL.
9. **Express Server Listen:** Express 5 starts listening on the configured `PORT` and mounts `/uploads` as a static directory with Cross-Origin Resource Policy headers.

---

### Step-by-Step Mechanism 2: Multi-Device QR Pairing & Signal Handshake
```
[Client / Dashboard] ──POST /sessions──► [Gateway] ──Init Socket──► [Baileys Driver]
                                                                        │
[Browser Displays QR Image] ◄──GET /sessions/:id/qr◄──'qr' Event────────┘
          │
          ▼ Admin scans with Phone (WhatsApp > Linked Devices > Link a Device)
[Phone WhatsApp] ──Signal Protocol Handshake──► [WhatsApp Web Servers]
                                                       │
[auth_states Table] ◄──Save Keys in DB◄──'connected' Event
[senderWorker] ◄──────Start Outbox Worker Loop
```

1. **Session Creation:** Client issues `POST /api/v1/sessions` with `{ "id": "sales-1", "name": "Sales Line" }`.
2. **Socket Initialization:** `sessionService` creates a database record in `sessions` with `status: 'starting'` and instantiates Baileys socket.
3. **QR Generation:** Baileys negotiates Noise Protocol handshake with WhatsApp servers, generating a raw pairing string. Emits `'qr'` event.
4. **QR Retrieval:** Dashboard requests `GET /api/v1/sessions/sales-1/qr?format=png`. Gateway converts the string to a 2D QR code PNG image via `qrcode` library.
5. **Physical Device Scan:** The company phone scans the QR code (**WhatsApp > Settings > Linked Devices > Link a Device**).
6. **Key Exchange:** The phone and Baileys exchange asymmetric Signal protocol keys (Curve25519 identity keys, ephemeral pre-keys, signed keys).
7. **PostgreSQL Key Persistence:** As keys arrive, our custom auth adapter serializes and upserts them into `auth_states`.
8. **Connection Confirmation:** Baileys emits `'connected'` with the authenticated phone number.
9. **State Transition:** The gateway updates `sessions.status = 'connected'` and signals `senderWorker.start(sessionId, provider)` to begin draining the outbox queue.

---

### Step-by-Step Mechanism 3: Outbound Message Sending with Anti-Ban Pacing
```
[Client Application] ──POST /messages/text──► [Gateway API]
                                                    │
                                                    ▼ 1. Authenticate API Key (SHA-256)
                                                    ▼ 2. Validate JID & Payload (Zod)
                                                    ▼ 3. Atomic SQL Transaction:
                                                         - Insert messages (status='queued')
                                                         - Insert outbox_jobs (status='queued')
                                                    ▼ 4. HTTP 202 Accepted (Instant Non-Blocking)
                                                    │
                                                    ▼ (Asynchronous Outbox Loop)
[senderWorker] ──outboxService.dequeue()──► [FOR UPDATE SKIP LOCKED]
       │
       ▼ Evaluates antiBanService.canSend(sessionId, recipientJid)
       │
       ├─► IF BLOCKED / RATE-LIMITED:
       │   outboxService.reschedule(job.id, cooldownMs)
       │   (Job unlocked, nextRetryAt set to future, sleeps in DB)
       │
       └─► IF ALLOWED:
           1. provider.sendPresenceUpdate(to, 'available')
           2. provider.sendPresenceUpdate(to, 'composing') (Typing indicator on phone)
           3. Sleep typing duration (textLength * random(35ms, 75ms))
           4. Baileys sock.sendMessage() over WebSocket
           5. outboxService.markSent(waMessageId)
           6. Sleep post-send jitter gap (4.0s - 9.0s)
```

1. **Client Request:** External application sends `POST /api/v1/sessions/:id/messages/text` with `{ "to": "919876543210", "text": "Your order #1042 has shipped!" }`.
2. **API Authentication:** Express middleware extracts Bearer token, computes SHA-256 hash, and verifies against `api_keys` table. Confirms `send` scope and chat-level access.
3. **Number Normalization:** Cleans digits and converts to WhatsApp JID (`919876543210@s.whatsapp.net`).
4. **Atomic Outbox Enqueue:** A single PostgreSQL transaction creates the business record in `messages` and the queue job in `outbox_jobs` with `status: 'queued'` and `nextRetryAt: NOW()`.
5. **Immediate Client Response:** API returns `HTTP 202 Accepted` with `{ "id": 481, "status": "queued" }`. The client never blocks.
6. **Concurrent Dequeue:** `senderWorker` runs `outboxService.dequeue(sessionId)` using `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`. The row is locked and marked `'processing'`.
7. **Anti-Ban Gatekeeper Evaluation:** `antiBanService.canSend(sessionId, recipientJid)` checks:
   - Rolling 60s window (&le; 4 msgs/min in strict mode).
   - Hardware gap (&ge; 5.0s since last sent message).
   - Same-recipient cooldown (&ge; 10.0s since last message to this recipient).
   - Cold contact velocity (&le; 6 new numbers this hour).
   - Burst pause (is natural break of 45-90s needed after 10 msgs?).
   - Daily limit cap (has daily warmup quota of 25 msgs been reached?).
8. **Cooldown Rescheduling:** If ANY rule is triggered, the worker calls `outboxService.reschedule(job.id, waitMs, reason)`. The job is unlocked, status reset to `'queued'`, and `nextRetryAt` set to the exact future timestamp. The worker is immediately freed.
9. **Human Presence Emulation:** When allowed:
   - Sends presence status `composing` (the customer's phone displays *"typing..."*).
   - Waits a realistic human typing delay calculated as $\text{characters} \times \text{random}(35\text{ms}, 75\text{ms})$, clamped between 2.5s and 9s.
10. **Socket Transmission:** Baileys encrypts the Protobuf frame and transmits over WebSocket to WhatsApp servers.
11. **Confirmation & Status Update:** WhatsApp responds with message ID `3EB0...`. Worker calls `outboxService.markSent()` updating both `outbox_jobs` and `messages` status to `'sent'`.
12. **Post-Send Jitter:** Worker sleeps for a randomized gap of 4 to 9 seconds before dequeuing the next job.

---

### Step-by-Step Mechanism 4: Inbound Message Handling & Signed Webhook Delivery
```
[Customer WhatsApp Phone] ────Sends Text Message────► [WhatsApp Network]
                                                             │
                                                             ▼ (WebSocket Protobuf)
                                                    [Baileys Driver Socket]
                                                             │
                                                             ▼ 'messages.upsert' event
                                                    [sessionService]
                                                             │
                                                             ▼ Normalizes Payload
                                                    [webhookService.handleInboundMessage]
                                                             │
                                                             ▼
                                                    [Postgres: messages Table]
                                                    (Persisted: fromMe=false, status='delivered')
                                                             │
                                                             ▼
                                                    [webhookDispatcher.dispatch()]
                                                    1. Compute HMAC-SHA256 signature
                                                    2. Header: X-Signature: sha256=...
                                                    3. POST to Subscribed Client Webhook URL
                                                    4. Exponential retry on failure (1s, 5s, 30s, 2m, 10m, 1h)
```

1. **Customer Message Transmission:** Customer sends a WhatsApp message to the company number.
2. **WebSocket Ingestion:** WhatsApp servers deliver the encrypted Signal message over the active Baileys WebSocket socket.
3. **Decryption & Normalization:** Baileys decrypts the message and emits `messages.upsert`. `sessionService` normalizes Baileys Protobuf structure into standard fields (`chatJid`, `type`, `body`, `waMessageId`, `timestamp`).
4. **Durable Persistence:** `webhookService.handleInboundMessage` inserts or finds the message in `messages` table with `fromMe: false` and `status: 'delivered'`.
5. **Webhook Filtering:** Finds active webhooks configured for this session subscribed to `message.received`.
6. **Cryptographic Signing:** Generates `X-Signature: sha256=<HMAC>` using the webhook's secret key and the raw JSON payload.
7. **Delivery Auditing:** Creates a record in `webhook_deliveries` with `status: 'pending'`.
8. **HTTP Post:** Dispatches HTTP POST to the client's destination URL. If client returns HTTP 2xx, marked `delivered`. If failed or timed out (&gt;5s), schedules automatic retries using exponential backoff (1s, 5s, 30s, 2m, 10m, 1h).

---

### Step-by-Step Mechanism 5: Autonomous AI Support Bot & RAG Knowledge Loop
```
[Inbound Message from Customer] ──► [aiBotService.handleInboundMessage()]
                                             │
                                             ▼ 1. Guardrail Checks:
                                                  - fromMe === true? (Skip)
                                                  - Agent replied < 5m ago? (Skip)
                                                  - Rate limit > 5 replies/min? (Skip)
                                             │
                                             ▼ 2. Extract Customer Question Text
                                             ▼ 3. ragService.answerQuestion()
                                                  │
                                                  ├─► Embed query via text-embedding-004 (768-D)
                                                  ├─► SQL: cosine_similarity search on knowledge_chunks
                                                  ├─► Retrieve top-4 documentation snippets
                                                  ├─► Fetch recent 6 messages from chat history
                                                  └─► LangChain + Gemini 1.5 Flash generates answer
                                             │
                                             ▼ 4. messageService.sendText(sessionId, chatJid, botAnswer)
                                             │
                                             ▼ 5. Queued in outbox_jobs -> Paced by SenderWorker -> Delivered!
```

1. **Trigger:** `webhookService.handleInboundMessage` invokes `aiBotService.handleInboundMessage()` whenever a customer message arrives (`fromMe: false`).
2. **Guardrail Evaluation:**
   - **Self-Filter:** Verifies `fromMe === false` (guaranteeing the bot never responds to its own messages).
   - **Human Intervention Pause:** Checks `aiBotService.isPausedForHuman(chatJid)`. If a human agent messaged this chat from the dashboard or phone within the last 5 minutes, the bot pauses to prevent talking over human operators.
   - **Rate Limiter:** Checks sliding window of bot responses. If more than 5 bot replies occurred in the last 60 seconds, suppresses generation.
3. **Question Extraction:** Extracts text content from `body.text` or `body.conversation`.
4. **Vector Embedding Generation:** Calls Google's `text-embedding-004` converting the question into a 768-dimensional normalized float vector.
5. **PostgreSQL Vector Retrieval:** Queries `knowledge_chunks` using `cosine_similarity(embedding, queryVec)` ordered by similarity descending, fetching the top 4 documentation chunks.
6. **Multi-Turn Chat History:** Queries `messages` table for the last 6 messages in this conversation thread, maintaining conversation continuity.
7. **Prompt Assembly & Synthesis:** LangChain compiles the System Persona, Documentation Context, Chat History, and Customer Question into a prompt passed to **Google Gemini 1.5 Flash**.
8. **Auto-Reply Enqueueing:** The generated answer is passed to `messageService.sendText(sessionId, chatJid, botAnswer)`.
9. **Paced Outbound Delivery:** The message enters the outbox queue, the sender worker types naturally with composing presence, and the answer arrives on the customer's phone!

---

### Step-by-Step Mechanism 6: Microphone Voice Recording & Push-To-Talk (PTT)
```
[User Clicks "Start Recording"] ──► [Browser navigator.mediaDevices.getUserMedia()]
                                             │
                                             ▼ HTML5 MediaRecorder captures 48kHz audio chunks
[Live Pulsing Timer: 00:08]                  │
                                             ▼ User clicks "Stop & Preview"
[Instant <audio controls> Preview] ◄── Blob URL created (audio/webm)
                                             │
                                             ▼ User clicks "Send Message"
[Browser Packages FormData] ──POST /messages/voice/upload──► [Multer Engine]
                                                                   │
                                                                   ▼ Writes to uploads/ directory
                                                            [messageService.sendVoice()]
                                                                   │
                                                                   ▼ Enqueues in outbox_jobs
                                                            [senderWorker]
                                                                   │
                                                                   ▼ Baileys socket.sendMessage()
                                                                     with flag { ptt: true }
                                                                   │
[Customer WhatsApp Phone] ◄──Renders as Native Voice Note with Audio Waveform Scrubber!
```

1. **Microphone Authorization:** User clicks **Start Recording Voice Note** in the React dashboard. Browser requests microphone permissions via `navigator.mediaDevices.getUserMedia({ audio: true })`.
2. **Audio Streaming:** HTML5 `MediaRecorder` captures 48kHz audio slices every 100ms. Live recording timer (`00:07`, `00:08`) and pulsing indicator display in the UI.
3. **Recording Stop & Blob Assembly:** User clicks **Stop & Preview**. The audio stream tracks are closed, and chunks are assembled into an `audio/webm` Blob.
4. **Instant In-Browser Playback:** `URL.createObjectURL(blob)` renders an HTML5 `<audio controls>` player so the user can listen before sending.
5. **Multipart Upload:** User clicks **Send Message**. The browser appends the binary blob to `FormData` and POSTs to `/api/v1/sessions/:id/messages/voice/upload`.
6. **Multer Disk Streaming:** The backend `upload.middleware.js` streams the file directly to the `uploads/` directory with a unique timestamp-UUID filename (e.g. `uploads/1790788157300-voice.webm`).
7. **Static URL Mapping:** Express exposes the file via `/uploads/...` with Cross-Origin-Resource-Policy headers.
8. **Outbox Enqueueing:** `messageService.sendVoice` saves the record and enqueues the job with `type: 'voice'`.
9. **WhatsApp Push-to-Talk (PTT) Dispatch:** When dequeued, Baileys streams the audio with `{ audio: { url }, ptt: true }`. 
10. **Native WhatsApp Rendering:** WhatsApp delivers the file to the recipient's phone as a **real WhatsApp Voice Note** (with green microphone icon and draggable audio waveform scrubber), rather than an ordinary audio file attachment!

---

## 11. Complete REST & Webhook API Reference

All requests must include:
```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### A. Session Management
- `POST /api/v1/sessions`: Create a new WhatsApp session (`{ "id": "sales-1", "name": "Sales Line" }`).
- `GET /api/v1/sessions/:id/qr?format=png`: Render live multi-device pairing QR code as image.
- `GET /api/v1/sessions/:id/qr?format=json`: Get raw pairing QR code string.
- `DELETE /api/v1/sessions/:id`: Terminate socket and log out session.
- `POST /api/v1/sessions/:id/simulate/incoming`: Inject mock customer reply for zero-ban testing (`{ "fromPhone": "919876543210", "text": "Hello!" }`).

### B. Outbound Messaging
- `POST /api/v1/sessions/:id/messages/text`: Send text message (`{ "to": "919876543210", "text": "Order confirmed", "idempotencyKey": "ord-1" }`).
- `POST /api/v1/sessions/:id/messages/voice/upload`: Multipart upload of audio file or mic blob, sent as WhatsApp PTT voice note.
- `POST /api/v1/sessions/:id/messages/image/upload`: Multipart upload of image with caption.
- `POST /api/v1/sessions/:id/messages/document/upload`: Multipart upload of PDF or document.
- `POST /api/v1/sessions/:id/messages/react`: Send emoji reaction (`{ "to": "919876543210", "waMessageId": "3EB0...", "emoji": "👍" }`).

### C. RAG Knowledge Base
- `GET /api/v1/rag/documents`: List indexed documents, chunk counts, and file sizes.
- `POST /api/v1/rag/documents/upload`: Multipart upload of `.pdf`, `.docx`, `.txt`, `.md` to automatically chunk and embed into PostgreSQL.
- `DELETE /api/v1/rag/documents/:id`: Remove document and cascade-delete its vector chunks.
- `POST /api/v1/rag/query`: Test vector similarity search and Gemini AI answer generation directly.
- `POST /api/v1/rag/settings`: Update Gemini API key or toggle AI auto-reply bot.

---

## 12. Operational Runbook, Resilience & Production Deployment

### Production Environment Variables (`.env`)
```env
PORT=3000
NODE_ENV=production
DATABASE_URL=postgres://user:password@postgres-host:5432/whatsapp_gateway
CORS_ORIGIN=https://your-dashboard-domain.com
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
DB_LOGGING=false

# WA_PROVIDER: 'baileys' for real numbers, 'mock' for sandbox simulation
WA_PROVIDER=baileys

# Anti-Ban Pacing Mode: 'strict' (recommended), 'moderate', or 'relaxed'
ANTI_BAN_MODE=strict

# Google Gemini API Configuration
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-1.5-flash
```

### Watchdog & Self-Healing
The system includes a 30-second recurring watchdog ([`src/workers/watchdog.js`](file:///c:/Users/Kaushik%20Aditya/Desktop/whatsapp-gateway/src/workers/watchdog.js)):
1. Checks all sessions marked `'connected'` in the database.
2. Inspects Baileys WebSocket readyState (`ws.readyState === 1`).
3. If a socket is silent or dead, it initiates exponential backoff reconnection (`1s, 2s, 4s, 8s, 16s, 32s, 60s`).
4. Reconnection restores authentication states directly from PostgreSQL without requiring a re-scan.
