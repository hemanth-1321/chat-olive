import asyncio
import logging
import uuid
from datetime import datetime
import redis.asyncio as aioredis

from sqlalchemy import update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings
from app.db.models import InferenceLog, Conversation
from app.lib.pii import redact

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

STREAM = "inference:logs"
GROUP = "workers"
CONSUMER = "worker-1"
MAX_RETRIES = 3

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def process(data: dict):
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


async def handle_message(r, msg_id, data):
    try:
        await process(data)
        await r.xack(STREAM, GROUP, msg_id)
        logger.info("Processed %s", data[b"id"].decode())
    except Exception as e:
        logger.error("Failed to process %s: %s", msg_id.decode() if isinstance(msg_id, bytes) else msg_id, e)


async def recover_pending(r):
    """Retry messages that were delivered but never ACKed."""
    pending = await r.xpending_range(STREAM, GROUP, min="-", max="+", count=50)
    for entry in pending:
        if entry["times_delivered"] > MAX_RETRIES:
            logger.warning("Dead-lettering message %s after %d attempts", entry["message_id"], entry["times_delivered"])
            await r.xack(STREAM, GROUP, entry["message_id"])
            continue
        messages = await r.xrange(STREAM, min=entry["message_id"], max=entry["message_id"])
        for msg_id, data in messages:
            await handle_message(r, msg_id, data)


async def main():
    r = aioredis.from_url(settings.redis_url)
    try:
        await r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except Exception:
        pass

    logger.info("Worker listening on %s...", STREAM)
    while True:
        # Recover any pending unACKed messages
        try:
            await recover_pending(r)
        except Exception as e:
            logger.error("Pending recovery error: %s", e)

        # Read new messages
        messages = await r.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10, block=2000)
        for stream, entries in messages:
            for msg_id, data in entries:
                await handle_message(r, msg_id, data)


if __name__ == "__main__":
    asyncio.run(main())
