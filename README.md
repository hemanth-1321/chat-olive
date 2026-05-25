# Ollive — LLM Inference Logging & Observability Platform

A full-stack platform for chatting with multiple LLM models while capturing inference telemetry in real time.

![Chat](https://img.shields.io/badge/Chat-SSE_Streaming-blue)
![Providers](https://img.shields.io/badge/Providers-Groq-green)
![Architecture](https://img.shields.io/badge/Architecture-Event_Driven-purple)
![Deploy](https://img.shields.io/badge/Deploy-GitHub_Actions-orange)

---

## Architecture

```mermaid
graph TB
    subgraph Frontend["React Frontend (Vite + shadcn/ui)"]
        UI[Chat UI / Dashboard / Logs]
    end

    subgraph Backend["FastAPI Backend"]
        API[REST + SSE Endpoints]
        SDK[LLM SDK Wrapper]
    end

    subgraph Providers["LLM Providers"]
        Groq[Groq API]
    end

    subgraph Pipeline["Event Pipeline"]
        Redis[(Redis Streams)]
        Worker[Ingestion Worker]
    end

    subgraph Storage["PostgreSQL"]
        DB[(conversations / messages / inference_logs)]
    end

    UI -->|REST + SSE| API
    API --> SDK
    SDK -->|Stream| Groq
    SDK -->|XADD| Redis
    Redis -->|XREADGROUP| Worker
    Worker -->|INSERT| DB
    API -->|CRUD| DB
```

## Request Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant FastAPI
    participant SDK
    participant Groq
    participant Redis
    participant Worker
    participant Postgres

    User->>Frontend: Type message, hit Send
    Frontend->>FastAPI: POST /api/chat/send (SSE)
    FastAPI->>Postgres: INSERT user message
    FastAPI->>SDK: chat_stream(messages, model)
    SDK->>Groq: POST /chat/completions (stream)
    loop Token streaming
        Groq-->>SDK: chunk
        SDK-->>FastAPI: yield chunk
        FastAPI-->>Frontend: SSE data: {chunk}
        Frontend-->>User: Render token (animated)
    end
    SDK->>Redis: XADD inference:logs (fire & forget)
    FastAPI->>Postgres: INSERT assistant message
    FastAPI-->>Frontend: SSE data: {done}
    Redis-->>Worker: XREADGROUP
    Worker->>Worker: PII redact previews
    Worker->>Postgres: INSERT inference_log
    Worker->>Postgres: UPDATE conversation.total_tokens
    Worker->>Redis: XACK
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Pydantic |
| LLM Providers | Groq (dynamic model discovery via API) |
| Pricing | LiteLLM community pricing JSON (cached 24h) |
| Event Bus | Redis Streams |
| Database | PostgreSQL 16 |
| Migrations | Alembic |
| CI/CD | GitHub Actions → SSH deploy to DigitalOcean |

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+ / Bun
- Docker (for Postgres + Redis)
- API key: [Groq](https://console.groq.com)

### Quick Start

```bash
git clone https://github.com/hemanth-1321/chat-olive.git
cd chat-olive
chmod +x setup.sh
./setup.sh
```

This installs all dependencies, starts Docker services, and runs migrations. After it completes, fill in your API key in `backend/.env` and start the services (see below).

### Manual Setup

<details>
<summary>Step-by-step instructions</summary>

#### 1. Clone

```bash
git clone https://github.com/hemanth-1321/chat-olive.git
cd chat-olive
```

#### 2. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis.

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your Groq API key in .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

### 4. Worker Setup (separate terminal)

```bash
cd backend
uv run python -m app.worker.consumer
```

### 5. Frontend Setup (separate terminal)

```bash
cd frontend
cp .env.example .env
bun install
bun dev
```

Open http://localhost:5173

### Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql+asyncpg://ollive:ollive@localhost:5432/ollive
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=gsk_...
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:8000
```

</details>

---

## Database Schema

```mermaid
erDiagram
    conversations {
        uuid id PK
        text session_id "anonymous user isolation"
        text title
        text model
        text provider
        text status "active | cancelled"
        timestamp created_at
        timestamp updated_at
        int message_count
        int total_tokens
    }
    messages {
        uuid id PK
        uuid conversation_id FK
        text role "user | assistant"
        text content
        timestamp created_at
    }
    inference_logs {
        uuid id PK
        uuid conversation_id FK
        uuid message_id FK
        text model
        text provider
        text status "success | error | cancelled"
        float latency_ms
        float ttft_ms
        int prompt_tokens
        int completion_tokens
        int total_tokens
        float estimated_cost_usd
        text input_preview "PII redacted"
        text output_preview "PII redacted"
        text error_message
        text request_id
        timestamp timestamp
    }
    conversations ||--o{ messages : has
    conversations ||--o{ inference_logs : has
    messages ||--o| inference_logs : references
```

### Design Decisions

- **`session_id` on conversations** — header-based anonymous isolation; each browser stores a username in localStorage and sends it via `x-session-id` header as `username@olive`, so each user only sees their own conversations
- **`inference_logs.message_id` uses `ON DELETE SET NULL`** — logs persist even if conversation is deleted (audit trail)
- **`total_tokens` denormalized on conversations** — avoids expensive SUM queries for dashboard
- **PII redaction on previews only** — full message content stored unredacted in `messages` table for conversation continuity
- **Indexes on `timestamp DESC` + `model` + `session_id`** — optimized for dashboard and per-user queries

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/send` | SSE streaming chat |
| GET | `/api/models` | List available models (fetched from Groq API) |
| GET | `/api/conversations/` | List conversations (scoped to session) |
| GET | `/api/conversations/:id` | Get conversation + messages |
| PATCH | `/api/conversations/:id/cancel` | Cancel conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |
| GET | `/api/metrics/overview` | Aggregate metrics |
| GET | `/api/metrics/throughput` | Per-minute throughput |
| GET | `/api/logs/` | Inference logs (filterable) |

---

## Dynamic Model Discovery

Models are fetched directly from the Groq API at runtime — no hardcoded model list. Non-text models (whisper, TTS, guard models) are filtered out automatically.

Pricing is pulled from [LiteLLM's community-maintained JSON](https://github.com/BerriAI/litellm) and cached for 24 hours. Models without pricing data still work — they just show $0.00 cost.

The frontend auto-discovers available models via `GET /api/models`.

---

## Event-Driven Ingestion

```
SDK → XADD "inference:logs" → Redis Stream → XREADGROUP → Worker → PostgreSQL
```

- **Non-blocking**: `asyncio.create_task()` publishes to Redis after stream completes — never adds latency to user response
- **At-least-once delivery**: Worker only ACKs after successful DB write. If it crashes, Redis redelivers
- **PII redaction**: Applied twice (SDK + Worker) as defense in depth
- **Backpressure**: Stream capped at 10,000 entries via `MAXLEN`

---

## CI/CD

On push to `main`, GitHub Actions SSHs into the DigitalOcean droplet and deploys:

```yaml
script: |
  cd /root/chat-olive
  git pull origin main
  docker compose -f docker-compose.prod.yml up -d --build
  docker image prune -f
```

Zero-downtime: `up --build` rebuilds images then swaps containers — old container serves traffic until the new one is ready.

---

## Failure Handling

| Failure | Behavior |
|---------|----------|
| LLM provider timeout | SDK catches, yields `[Error]`, publishes error event |
| Redis down (publish) | Fire-and-forget fails silently — log is lost |
| Worker crashes mid-process | No XACK → Redis redelivers on restart |
| Postgres down (worker) | Exception caught, no XACK, retries next poll |
| Frontend disconnects mid-stream | Backend saves partial response in `finally` block |

---

## Scaling Considerations

| Concern | Current | At Scale |
|---------|---------|----------|
| Workers | Single process | N containers in same consumer group — Redis distributes automatically |
| DB writes | Direct INSERT | PgBouncer + partition `inference_logs` by month |
| API throughput | Single uvicorn | Multiple workers behind nginx / k8s HPA |
| Redis memory | 256MB LRU | Redis Cluster or increase limit |
| Dashboard queries | Raw SQL | Materialized views refreshed every minute |

---

## What I'd Improve With More Time

1. **Guaranteed log delivery** — in-process buffer with retry if Redis is down
2. **Auth** — JWT for users, API keys for SDK consumers (currently uses anonymous session via localStorage)
3. **Streaming cancellation** — propagate cancel upstream to provider (save tokens)
4. **OpenTelemetry** — distributed tracing across API + worker
5. **Test suite** — pytest + httpx AsyncClient for API, mock Redis for worker
6. **k8s manifests** — HPA on worker, readiness probes
7. **Richer PII** — Microsoft Presidio (NER-based) instead of regex

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── config.py            # pydantic-settings
│   │   ├── api/
│   │   │   ├── chat.py          # SSE streaming endpoint
│   │   │   ├── conversation.py  # CRUD (session-scoped)
│   │   │   ├── session.py       # Header-based session isolation
│   │   │   ├── metrics.py       # Dashboard queries
│   │   │   └── logs.py          # Inference logs
│   │   ├── sdk/
│   │   │   └── llm_sdk.py       # Groq streaming wrapper
│   │   ├── worker/
│   │   │   └── consumer.py      # Redis stream consumer
│   │   ├── db/
│   │   │   ├── database.py      # Async engine
│   │   │   └── models.py        # SQLAlchemy ORM
│   │   └── lib/
│   │       ├── pricing.py       # Dynamic model discovery + LiteLLM pricing
│   │       └── pii.py           # Regex PII redaction
│   ├── alembic/                  # Migrations
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── StreamingMessage.tsx  # Animated token rendering
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ModelPicker.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── LogsTable.tsx
│   │   └── hooks/
│   │       ├── useChat.ts
│   │       ├── useConversations.ts
│   │       └── useMetrics.ts
│   ├── package.json
│   └── .env
├── .github/workflows/
│   ├── ci.yml                    # Lint + type check
│   └── deploy.yml                # Auto-deploy to DigitalOcean
├── docker-compose.yml            # Local dev (Postgres + Redis)
└── docker-compose.prod.yml       # Production (backend + worker)
```

---

## License

MIT
