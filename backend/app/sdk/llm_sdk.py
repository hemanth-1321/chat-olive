import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator

import httpx
import redis.asyncio as aioredis

from app.config import settings
from app.lib.pricing import get_cost
from app.lib.pii import redact

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMWrapper:
    def __init__(self):
        self.redis_client = aioredis.from_url(settings.redis_url)

    async def chat_stream(self, messages: list[dict], model: str, provider: str, conversation_id: str, message_id: str) -> AsyncGenerator[str, None]:
        start = time.perf_counter()
        ttft = None
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        status = "success"
        error_message = ""
        request_id = ""
        output_chunks: list[str] = []

        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload) as response:
                    request_id = response.headers.get("X-Request-ID", "")
                    if response.status_code != 200:
                        body = await response.aread()
                        error_message = body.decode()[:200]
                        status = "error"
                        yield f"[Error]: {error_message}"
                    else:
                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            chunk = json.loads(data)
                            if chunk.get("usage"):
                                prompt_tokens = chunk["usage"].get("prompt_tokens", 0)
                                completion_tokens = chunk["usage"].get("completion_tokens", 0)
                                total_tokens = prompt_tokens + completion_tokens
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                if ttft is None:
                                    ttft = (time.perf_counter() - start) * 1000
                                output_chunks.append(content)
                                yield content
        except Exception as e:
            status = "error"
            error_message = str(e)
            yield f"[Error]: {error_message}"

        latency_ms = (time.perf_counter() - start) * 1000
        input_preview = redact(messages[-1]["content"][:200]) if messages else ""
        output_preview = redact("".join(output_chunks)[:200])
        cost = get_cost(model, prompt_tokens, completion_tokens)

        event = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": message_id,
            "model": model,
            "provider": provider,
            "status": status,
            "latency_ms": str(latency_ms),
            "ttft_ms": str(ttft or ""),
            "prompt_tokens": str(prompt_tokens),
            "completion_tokens": str(completion_tokens),
            "total_tokens": str(total_tokens),
            "estimated_cost_usd": str(cost),
            "input_preview": input_preview,
            "output_preview": output_preview,
            "error_message": error_message,
            "request_id": request_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        asyncio.create_task(self._publish_event(event))

    async def _publish_event(self, event: dict):
        try:
            await self.redis_client.xadd("inference:logs", event, maxlen=10000)
        except Exception as e:
            print(f"Error publishing event: {e}")
