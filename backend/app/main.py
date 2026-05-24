from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat,conversation, logs,metrics

@asynccontextmanager
async def lifespan(app:FastAPI):
    yield

app=FastAPI(title="Olive", lifespan=lifespan)

app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )

app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(conversation.router, prefix="/api/conversations", tags=["conversations"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
  