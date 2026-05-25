import time
import httpx

GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"

EXCLUDE_PREFIXES = ("whisper", "orpheus", "canopy", "distil-whisper")
EXCLUDE_CONTAINS = ("prompt-guard", "safeguard")

# Cached pricing from LiteLLM
_pricing_cache: dict[str, dict] = {}
_pricing_fetched_at: float = 0
_CACHE_TTL = 86400  # 24h


async def fetch_pricing() -> dict[str, dict]:
    global _pricing_cache, _pricing_fetched_at
    if _pricing_cache and (time.time() - _pricing_fetched_at) < _CACHE_TTL:
        return _pricing_cache
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
            )
            data = resp.json()
        _pricing_cache = data
        _pricing_fetched_at = time.time()
    except Exception:
        pass
    return _pricing_cache


async def get_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = await fetch_pricing()
    # LiteLLM keys use "groq/" prefix
    key = f"groq/{model}" if not model.startswith("groq/") else model
    info = pricing.get(key) or pricing.get(model, {})
    input_cost = info.get("input_cost_per_token", 0) or 0
    output_cost = info.get("output_cost_per_token", 0) or 0
    return prompt_tokens * input_cost + completion_tokens * output_cost


async def fetch_groq_models(api_key: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            data = resp.json()
        return [
            {"id": m["id"], "provider": "Groq"}
            for m in data.get("data", [])
            if not any(m["id"].startswith(p) for p in EXCLUDE_PREFIXES)
            and not any(s in m["id"] for s in EXCLUDE_CONTAINS)
        ]
    except Exception:
        return []
