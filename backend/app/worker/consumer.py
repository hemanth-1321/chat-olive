import asyncio
import uuid
from datetime import datetime
import redis.asyncio as aioredis

from sqlalchemy import update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings
from app.db.models import InferenceLog, Conversation
from app.lib.pii import redact

STREAM = "inference:logs"
GROUP = "workers"
CONSUMER = "worker-1"

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def process(data: dict):
    # Small delay to let the chat endpoint finish inserting the assistant message
    await asyncio.sleep(0.5)
    async with async_session() as session:
        log = InferenceLog(
            id=uuid.UUID(data[b"id"].decode()),
            conversation_id=uuid.UUID(data[b"conversation_id"].decode()),
            message_id=uuid.UUID(data[b"message_id"].decode()) if data.get(b"message_id") and data[b"message_id"] != b"" else None,
            model=data[b"model"].decode(),
            provider=data[b"provider"].decode(),
            status=data[b"status"].decode(),
            latency_ms=float(data[b"latency_ms"]) if data.get(b"latency_ms") else None,
            ttft_ms=float(data[b"ttft_ms"]) if data.get(b"ttft_ms") and data[b"ttft_ms"] != b"" else None,
            prompt_tokens=int(data[b"prompt_tokens"]),
            completion_tokens=int(data[b"completion_tokens"]),
            total_tokens=int(data[b"total_tokens"]),
            estimated_cost_usd=float(data[b"estimated_cost_usd"]),
            input_preview=redact(data[b"input_preview"].decode()),
            output_preview=redact(data[b"output_preview"].decode()),
            error_message=data[b"error_message"].decode() or None,
            request_id=data[b"request_id"].decode() or None,
            timestamp=datetime.fromisoformat(data[b"timestamp"].decode().replace("Z", "+00:00")),
        )
        session.add(log)
        await session.execute(
            update(Conversation)
            .where(Conversation.id == uuid.UUID(data[b"conversation_id"].decode()))
            .values(total_tokens=Conversation.total_tokens + int(data[b"total_tokens"]))
        )
        await session.commit()


async def main():
    r = aioredis.from_url(settings.redis_url)
    try:
        await r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except Exception:
        pass

    print(f"Worker listening on {STREAM}...")
    while True:
        messages = await r.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10, block=2000)
        for stream, entries in messages:
            for msg_id, data in entries:
                try:
                    await process(data)
                    await r.xack(STREAM, GROUP, msg_id)
                    print(f"[OK] {data[b'id'].decode()}")
                except Exception as e:
                    print(f"[ERR] {e}")


if __name__ == "__main__":
    asyncio.run(main())
