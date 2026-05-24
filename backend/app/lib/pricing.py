from dataclasses import dataclass


@dataclass
class ModelConfig:
    provider: str
    base_url: str
    api_key_name: str
    prompt_cost_per_m: float = 0.0
    completion_cost_per_m: float = 0.0


MODELS: dict[str, ModelConfig] = {
    # Groq
    "llama-3.3-70b-versatile": ModelConfig(
        provider="Groq",
        base_url="https://api.groq.com/openai/v1/chat/completions",
        api_key_name="groq_api_key",
        prompt_cost_per_m=0.59,
        completion_cost_per_m=0.79,
    ),
    "llama-3.1-8b-instant": ModelConfig(
        provider="Groq",
        base_url="https://api.groq.com/openai/v1/chat/completions",
        api_key_name="groq_api_key",
        prompt_cost_per_m=0.05,
        completion_cost_per_m=0.08,
    ),
    "meta-llama/llama-4-scout-17b-16e-instruct": ModelConfig(
        provider="Groq",
        base_url="https://api.groq.com/openai/v1/chat/completions",
        api_key_name="groq_api_key",
        prompt_cost_per_m=0.11,
        completion_cost_per_m=0.34,
    ),
    # Gemini
    "gemini-2.0-flash": ModelConfig(
        provider="Google",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        api_key_name="gemini_api_key",
    ),
    "gemini-2.5-flash-preview-05-20": ModelConfig(
        provider="Google",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        api_key_name="gemini_api_key",
    ),
}


def get_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    cfg = MODELS.get(model)
    if not cfg:
        return 0.0
    return (prompt_tokens * cfg.prompt_cost_per_m + completion_tokens * cfg.completion_cost_per_m) / 1_000_000
