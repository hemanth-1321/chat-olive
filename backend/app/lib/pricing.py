MODELS = {
      "anthropic/claude-sonnet-4-5": ("Anthropic", 3.0, 15.0),
      "openai/gpt-4.1": ("OpenAI", 2.0, 8.0),
      "google/gemini-2.0-flash-exp:free": ("Google", 0.0, 0.0),
      "deepseek/deepseek-chat": ("DeepSeek", 0.27, 1.10),
      "meta-llama/llama-3.3-70b-instruct:free": ("Meta", 0.0, 0.0),
      "mistralai/mistral-7b-instruct:free": ("Mistral", 0.0, 0.0),
  }

def get_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
      if model not in MODELS:
          return 0.0
      _, prompt_cost, completion_cost = MODELS[model]
      return (prompt_tokens * prompt_cost + completion_tokens * completion_cost) / 1_000_000
  