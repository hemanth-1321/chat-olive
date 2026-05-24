# Ollive LLM Platform — Complete Specification

---

## 1. Overview

A full-stack LLM observability platform with:
- Multi-model chatbot (OpenRouter)
- Streaming responses (SSE)
- Event-driven inference logging (Redis Streams)
- Ingestion worker (separate process)
- Observability dashboard (latency, throughput, errors)
- PII redaction
- Docker Compose one-command setup

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│         Chat UI │ Sidebar │ Dashboard │ Logs Table          │
└────────────────────────┬────────────────────────────────────┘
                         │ REST + SSE
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend                            │
│                                                             │
│  POST /api/chat/send  ──► LLM SDK Wrapper                  │
│                               │                             │
│                               ├──► OpenRouter API (stream)  │
│                               │    tokens via SSE ──► user  │
│                               │                             │
│                               └──► publish to Redis Stream  │
│                                    "inference:logs"         │
│                                                             │
│  GET  /api/conversations/    (list, resume)                 │
│  POST /api/conversations/    (create)                       │
│  GET  /api/conversations/:id (get with messages)            │
│  DEL  /api/conversations/:id (delete)                       │
│  PATCH /api/conversations/:id/cancel                        │
│                                                             │
│  GET  /api/metrics/overview                                 │
│  GET  /api/metrics/throughput                               │
│  GET  /api/logs/                                            │
└──────────────────────────────────────────────────────────── ┘
                         │
                         │ XADD (publish event)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Redis Streams                              │
│                                                             │
│  Stream key:  inference:logs                                │
│  Consumer group: workers                                    │
│  Consumer name: worker-1                                    │
│                                                             │
│  Event payload:                                             │
│  {                                                          │
│    id, conversation_id, message_id,                         │
│    model, provider, status,                                 │
│    latency_ms, ttft_ms,                                     │
│    prompt_tokens, completion_tokens, total_tokens,          │
│    estimated_cost_usd,                                      │
│    input_preview, output_preview,                           │
│    error_message, request_id, timestamp                     │
│  }                                                          │
└──────────────────────────────────────────────────────────── ┘
                         │
                         │ XREADGROUP (consume)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker (separate process/container)            │
│                                                             │
│  1. XREADGROUP — blocking read from Redis stream            │
│  2. Parse + validate event payload                          │
│  3. PII redact input_preview + output_preview               │
│  4. Write to inference_logs table                           │
│  5. Update conversations.total_tokens                       │
│  6. XACK — acknowledge message (removes from pending)       │
│  7. On error → log, do NOT ack (Redis retries)              │
└──────────────────────────────────────────────────────────── ┘
                         │
                         │ asyncpg / SQLAlchemy async
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL                               │
│   conversations │ messages │ inference_logs                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
ollive-llm-platform/
├── backend/
│   ├── pyproject.toml          ← uv deps (fastapi, sqlalchemy, redis, httpx...)
│   ├── uv.lock
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   │       └── 001_initial.py
│   └── app/
│       ├── main.py             ← FastAPI app, lifespan, CORS, routers
│       ├── config.py           ← settings (pydantic-settings, reads .env)
│       ├── api/
│       │   ├── __init__.py
│       │   ├── chat.py         ← SSE streaming endpoint
│       │   ├── conversations.py
│       │   ├── metrics.py
│       │   └── logs.py
│       ├── sdk/
│       │   ├── __init__.py
│       │   └── llm_sdk.py      ← OpenRouter wrapper, metadata capture
│       ├── worker/
│       │   ├── __init__.py
│       │   └── consumer.py     ← Redis stream consumer (entrypoint)
│       ├── db/
│       │   ├── __init__.py
│       │   ├── database.py     ← async engine, session factory
│       │   └── models.py       ← SQLAlchemy ORM models
│       └── lib/
│           ├── __init__.py
│           ├── pii.py          ← regex PII redaction
│           └── pricing.py      ← per-model cost table
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── Sidebar.jsx         ← conversation list, cancel, resume
│       │   ├── ChatWindow.jsx      ← SSE streaming, message bubbles
│       │   ├── ModelPicker.jsx     ← dropdown with provider badges
│       │   ├── Dashboard.jsx       ← metrics charts
│       │   └── LogsTable.jsx       ← inference logs live table
│       └── hooks/
│           ├── useChat.js          ← SSE logic, abort controller
│           ├── useConversations.js
│           └── useMetrics.js       ← polling /api/metrics every 5s
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. Database Schema (PostgreSQL + SQLAlchemy)

### 4.1 conversations

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    model       TEXT NOT NULL,           -- e.g. "anthropic/claude-sonnet-4-5"
    provider    TEXT NOT NULL,           -- e.g. "Anthropic"
    status      TEXT NOT NULL DEFAULT 'active',  -- active | cancelled
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_count   INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0
);

-- status check
ALTER TABLE conversations ADD CONSTRAINT chk_status
    CHECK (status IN ('active', 'cancelled'));
```

**Decisions:**
- `updated_at` bumped on every new message — used for ordering in sidebar
- `total_tokens` denormalised here for fast dashboard queries (avoid SUM every time)
- `message_count` same reason

---

### 4.2 messages

```sql
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL,       -- user | assistant
    content             TEXT NOT NULL,       -- full message text
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

ALTER TABLE messages ADD CONSTRAINT chk_role
    CHECK (role IN ('user', 'assistant'));
```

**Decisions:**
- No `content_preview` column here — previews only live in `inference_logs`
- `ON DELETE CASCADE` — delete conversation → messages auto-deleted
- Index on `conversation_id` critical — every chat load queries this

---

### 4.3 inference_logs

```sql
CREATE TABLE inference_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id          UUID REFERENCES messages(id) ON DELETE SET NULL,
    model               TEXT NOT NULL,
    provider            TEXT NOT NULL,
    status              TEXT NOT NULL,       -- success | error | cancelled
    latency_ms          FLOAT,               -- total end-to-end ms
    ttft_ms             FLOAT,               -- time to first token ms
    prompt_tokens       INTEGER DEFAULT 0,
    completion_tokens   INTEGER DEFAULT 0,
    total_tokens        INTEGER DEFAULT 0,
    estimated_cost_usd  FLOAT DEFAULT 0,
    input_preview       TEXT,                -- PII redacted, max 200 chars
    output_preview      TEXT,                -- PII redacted, max 200 chars
    error_message       TEXT,
    request_id          TEXT,                -- OpenRouter upstream request ID
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_conversation_id ON inference_logs(conversation_id);
CREATE INDEX idx_logs_timestamp ON inference_logs(timestamp DESC);
CREATE INDEX idx_logs_model ON inference_logs(model);
CREATE INDEX idx_logs_status ON inference_logs(status);
CREATE INDEX idx_logs_timestamp_model ON inference_logs(timestamp DESC, model);
```

**Decisions:**
- `ON DELETE SET NULL` not CASCADE — keep logs even if conversation deleted (audit trail)
- `latency_ms` and `ttft_ms` stored separately — TTFT is the UX metric, total latency is infra metric
- `input_preview` / `output_preview` max 200 chars, PII redacted before storage
- `request_id` from OpenRouter lets you trace upstream if needed
- Composite index on `(timestamp, model)` for dashboard group-by queries

---

## 5. Complete API Spec

### Chat

```
POST /api/chat/send
Body: {
  conversation_id?: string   (null = create new)
  message: string
  model: string
}
Response: SSE stream
  data: {"chunk": "token..."}
  data: {"chunk": "token..."}
  data: {"done": true, "conversation_id": "...", "message_id": "..."}

POST /api/chat/new
Body: { model: string, title?: string }
Response: { conversation_id: string, title: string }
```

### Conversations

```
GET    /api/conversations/               → list all, ordered by updated_at DESC
GET    /api/conversations/:id            → get + all messages
PATCH  /api/conversations/:id/cancel     → set status = cancelled
DELETE /api/conversations/:id            → hard delete
```

### Metrics

```
GET /api/metrics/overview
Response: {
  total_requests: int,
  successful: int,
  errors: int,
  error_rate: float,          -- percentage
  avg_latency_ms: float,
  p95_latency_ms: float,
  avg_ttft_ms: float,
  total_tokens: int,
  total_cost_usd: float,
  by_model: [...],
  hourly: [...],              -- last 24h
  latency_series: [...]       -- last 50 requests
}

GET /api/metrics/throughput
Response: [...per-minute request + token counts, last 1h...]
```

### Logs

```
GET /api/logs/?limit=100&offset=0&model=...&status=...
Response: [inference_log, ...]
```

---

## 6. SDK Wrapper — llm_sdk.py

```python
# What it does:
# 1. Opens streaming request to OpenRouter
# 2. Yields tokens as they arrive (piped to SSE)
# 3. Records: start_time, time_of_first_token
# 4. On stream complete: captures total latency, ttft, token counts, cost
# 5. Publishes InferenceEvent to Redis Stream (XADD) — non-blocking

class LLMSDKWrapper:
    async def chat_stream(
        self,
        messages: list[dict],
        model: str,
        conversation_id: str,
        message_id: str,
    ) -> AsyncGenerator[str, None]:
        # 1. record start
        # 2. open httpx stream to openrouter
        # 3. yield chunks → FastAPI pipes to SSE → browser renders
        # 4. record ttft on first chunk
        # 5. on completion → build InferenceEvent
        # 6. asyncio.create_task(redis.xadd("inference:logs", event))
        # ↑ fire and forget, never blocks the stream
```

**Key design:** Redis publish is `asyncio.create_task()` — it runs after the response is done, never adds latency to the user.

---

## 7. Worker — consumer.py

```python
# Entrypoint: uv run python app/worker/consumer.py
# Runs in its own Docker container

async def main():
    # 1. Connect to Redis
    # 2. Create consumer group if not exists:
    #    XGROUP CREATE inference:logs workers $ MKSTREAM
    # 3. Loop forever:
    #    messages = await redis.xreadgroup(
    #        groupname="workers",
    #        consumername="worker-1",
    #        streams={"inference:logs": ">"},
    #        count=10,
    #        block=2000,   # block 2s if no messages
    #    )
    #    for msg in messages:
    #        await process(msg)
    #        await redis.xack("inference:logs", "workers", msg.id)

async def process(event: dict):
    # 1. Parse + validate fields
    # 2. PII redact input_preview + output_preview
    # 3. INSERT into inference_logs
    # 4. UPDATE conversations SET total_tokens = total_tokens + event.total_tokens
    # 5. XACK (only after successful DB write)
    # On exception: log error, do NOT xack → Redis will redeliver
```

**Key design:** XACK only after successful DB write. If worker crashes mid-process, Redis redelivers the event. No logs are lost.

---

## 8. Redis Stream Design

```
Stream key:    inference:logs
Consumer group: workers
Max length:    MAXLEN ~ 10000 (trim old events, cap memory)

Event fields (all strings — Redis Streams are string key-value):
  id                 UUID
  conversation_id    UUID
  message_id         UUID
  model              str
  provider           str
  status             success|error|cancelled
  latency_ms         float as str
  ttft_ms            float as str  (empty string if not recorded)
  prompt_tokens      int as str
  completion_tokens  int as str
  total_tokens       int as str
  estimated_cost_usd float as str
  input_preview      str (200 chars max, PII redacted at source)
  output_preview     str (200 chars max, PII redacted at source)
  error_message      str (empty string if none)
  request_id         str
  timestamp          ISO8601 string
```

---

## 9. PII Redaction — pii.py

```python
# Applied in TWO places:
# 1. SDK — before publishing to Redis (previews only)
# 2. Worker — again before writing to DB (defence in depth)

PATTERNS = [
    (r'\b[\w.-]+@[\w.-]+\.\w{2,}\b',           '[EMAIL]'),
    (r'\b(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b', '[PHONE]'),
    (r'\b\d{3}-\d{2}-\d{4}\b',                  '[SSN]'),
    (r'\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b', '[CARD]'),
    (r'\b[A-Z]{2}\d{6}[A-Z]\b',                 '[PASSPORT]'),
]
# Full message content (stored in messages table) is NOT redacted
# Only previews (stored in inference_logs) are redacted
```

---

## 10. Multi-Model Support (OpenRouter)

```python
MODELS = {
    "anthropic/claude-sonnet-4-5":              ("Anthropic", 3.0, 15.0),
    "openai/gpt-4.1":                           ("OpenAI",    2.0,  8.0),
    "google/gemini-2.0-flash-exp:free":         ("Google",    0.0,  0.0),
    "deepseek/deepseek-chat":                   ("DeepSeek",  0.27, 1.10),
    "meta-llama/llama-3.3-70b-instruct:free":   ("Meta",      0.0,  0.0),
    "mistralai/mistral-7b-instruct:free":       ("Mistral",   0.0,  0.0),
}
# (provider, prompt_cost_per_1M, completion_cost_per_1M)
# cost estimated client-side after token counts received
```

---

## 11. Docker Compose

```yaml
services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ollive
      POSTGRES_USER: ollive
      POSTGRES_PASSWORD: ollive
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: pg_isready -U ollive
      interval: 5s

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: redis-cli ping
      interval: 5s

  backend:
    build: ./backend
    command: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports: ["8000:8000"]
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DATABASE_URL=postgresql+asyncpg://ollive:ollive@postgres:5432/ollive
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  worker:
    build: ./backend          ← same image as backend
    command: uv run python app/worker/consumer.py
    environment:
      - DATABASE_URL=postgresql+asyncpg://ollive:ollive@postgres:5432/ollive
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]

volumes:
  postgres_data:
```

---

## 12. pyproject.toml (uv)

```toml
[project]
name = "ollive-backend"
version = "0.1.0"
requires-python = ">=3.12"

dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "sqlalchemy[asyncio]>=2.0",
  "asyncpg>=0.29",
  "alembic>=1.13",
  "redis>=5.0",           # redis-py with async support
  "httpx>=0.27",
  "pydantic>=2.9",
  "pydantic-settings>=2.5",
  "python-multipart>=0.0.12",
]
```

---

## 13. Environment Variables

```bash
# .env
OPENROUTER_API_KEY=sk-or-v1-...
DATABASE_URL=postgresql+asyncpg://ollive:ollive@postgres:5432/ollive
REDIS_URL=redis://redis:6379
```

---

## 14. Complete Request Lifecycle (step by step)

```
1.  User types message, hits Send
2.  React calls POST /api/chat/send
      { conversation_id, message, model }
3.  FastAPI:
      a. If no conversation_id → INSERT into conversations
      b. INSERT user message into messages
      c. SELECT last 10 messages for context
      d. Instantiate LLMSDKWrapper
      e. Return StreamingResponse (SSE)

4.  LLMSDKWrapper.chat_stream():
      a. Record start_time = time.perf_counter()
      b. Open httpx stream to OpenRouter
         POST https://openrouter.ai/api/v1/chat/completions
         { model, messages, stream: true, stream_options: {include_usage: true} }
      c. For each SSE chunk from OpenRouter:
         - Parse JSON
         - If content → record ttft_ms (first time only)
         - yield content chunk

5.  FastAPI SSE handler:
      For each chunk from SDK:
        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
      → Browser receives token, appends to message bubble in real time

6.  Stream ends:
      a. SDK records:
         latency_ms = (now - start_time) * 1000
         token counts from final usage chunk
         estimated_cost = (prompt * cost_per_token) + (completion * cost_per_token)
      b. asyncio.create_task(redis.xadd("inference:logs", event_dict))
         ← FIRE AND FORGET, does not block stream completion

7.  FastAPI (after stream):
      a. INSERT assistant message into messages
      b. UPDATE conversations SET updated_at, message_count += 2
      c. yield "data: {done: true, conversation_id, message_id}\n\n"

8.  Browser receives done event:
      a. Marks message as complete (removes streaming cursor)
      b. Refreshes conversation sidebar

9.  Redis receives XADD:
      Event sits in "inference:logs" stream
      Consumer group "workers" has it pending

10. Worker (consumer.py) — running in separate container:
      a. XREADGROUP blocks until event arrives (max 2s)
      b. Receives event
      c. Parses all fields
      d. PII redacts input_preview + output_preview (second pass)
      e. INSERT into inference_logs
      f. UPDATE conversations SET total_tokens += event.total_tokens
      g. XACK → removes from pending, marks processed
      h. If step e or f fails → exception caught, NO XACK
         Redis keeps event in pending list → redelivered on next poll

11. Dashboard (polling every 5s):
      GET /api/metrics/overview
      → reads from inference_logs + conversations
      → renders latency chart, error rate, throughput bars
```

---

## 15. Failure Handling

| Failure | Behaviour |
|---|---|
| OpenRouter timeout | SDK catches, yields `[ERROR]`, publishes error event to Redis |
| Redis down (publish) | asyncio.create_task silently fails — log is lost. Accept this tradeoff for now |
| Worker crashes mid-process | No XACK sent → Redis redelivers event on restart |
| Postgres down (worker) | Worker catches exception, no XACK, retries on next poll |
| Frontend SSE disconnects | httpx stream closes, SDK still publishes log to Redis |
| Duplicate event delivery | `INSERT OR IGNORE` on inference_log id — idempotent |

---

## 16. Scaling Considerations

| Concern | Current | At Scale |
|---|---|---|
| Multiple workers | Run N worker containers, each is a different consumer in the group | Redis distributes messages across consumers automatically |
| High write volume | Single Postgres | Add PgBouncer connection pooler, partition inference_logs by month |
| Redis memory | 256mb cap, LRU eviction | Use Redis Cluster or increase limit |
| API throughput | Single uvicorn process | Multiple uvicorn workers behind nginx, or deploy on k8s with HPA |
| Dashboard queries | Raw SQL aggregations | Add materialized views refreshed every minute |

---

## 17. What We'd Improve With More Time

1. **Guaranteed log delivery** — if Redis is down, buffer events in-process queue with a retry loop
2. **Alembic migrations** — proper versioned schema migrations instead of `CREATE TABLE IF NOT EXISTS`
3. **Auth** — JWT for users, API keys for SDK consumers
4. **Streaming cancellation** — propagate cancel upstream to OpenRouter to avoid wasted tokens
5. **Cost table from API** — pull live pricing from OpenRouter `/models` instead of hardcoding
6. **Alerting** — publish to a second Redis stream when error_rate > threshold
7. **k8s manifests** — HPA on worker, readiness probes on all services
8. **Richer PII** — use Microsoft Presidio (NER-based) instead of regex
9. **OpenTelemetry traces** — distributed tracing across API + worker
10. **Test suite** — pytest with httpx AsyncClient for API, mock Redis for worker

---

## 18. Build Order (for implementation)

```
Day 1:
  ✅ uv init, pyproject.toml
  ✅ SQLAlchemy models (conversations, messages, inference_logs)
  ✅ Alembic migration
  ✅ FastAPI skeleton + config.py (pydantic-settings)
  ✅ /api/conversations CRUD
  ✅ LLM SDK wrapper (OpenRouter streaming)
  ✅ /api/chat/send SSE endpoint

Day 2:
  ✅ Redis publish in SDK
  ✅ Worker consumer.py (XREADGROUP loop)
  ✅ PII redaction lib
  ✅ /api/metrics/overview + /api/metrics/throughput
  ✅ /api/logs/
  ✅ React frontend (Chat + Sidebar + Dashboard + Logs)
  ✅ Docker Compose (5 services)
  ✅ README
```