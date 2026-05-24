#!/bin/bash
set -e

echo "🫒 Ollive Platform Setup"
echo "========================"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required"; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "❌ uv required (curl -LsSf https://astral.sh/uv/install.sh | sh)"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "❌ Bun required (curl -fsSL https://bun.sh/install | bash)"; exit 1; }

# Start infra
echo "▶ Starting Postgres + Redis..."
docker compose up -d

# Backend
echo "▶ Setting up backend..."
cd backend
[ -f .env ] || cp .env.example .env
uv sync
echo "▶ Running migrations..."
uv run alembic upgrade head
cd ..

# Frontend
echo "▶ Setting up frontend..."
cd frontend
[ -f .env ] || cp .env.example .env
bun install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Fill in your API keys:"
echo "  backend/.env → GROQ_API_KEY, GEMINI_API_KEY"
echo ""
echo "Then run (3 terminals):"
echo "  1. cd backend && uv run uvicorn app.main:app --reload --port 8000"
echo "  2. cd backend && uv run python -m app.worker.consumer"
echo "  3. cd frontend && bun dev"
echo ""
echo "Open http://localhost:5173"
