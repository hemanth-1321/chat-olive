from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import InferenceLog, Conversation
from app.api.session import get_session_id
  
router = APIRouter()
  
  
@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), session_id: str = Depends(get_session_id)):
      query = select(
              func.count(InferenceLog.id).label("total_requests"),
              func.count().filter(InferenceLog.status == "success").label("successful"),
              func.count().filter(InferenceLog.status == "error").label("errors"),
              func.avg(InferenceLog.latency_ms).label("avg_latency_ms"),
              func.percentile_cont(0.95).within_group(InferenceLog.latency_ms).label("p95_latency_ms"),
              func.avg(InferenceLog.ttft_ms).label("avg_ttft_ms"),
              func.sum(InferenceLog.total_tokens).label("total_tokens"),
              func.sum(InferenceLog.estimated_cost_usd).label("total_cost_usd"),
          ).outerjoin(Conversation, InferenceLog.conversation_id == Conversation.id)
      if session_id:
          query = query.where(Conversation.session_id == session_id)
      result = await db.execute(query)
      row = result.one()
      total = row.total_requests or 0
      errors = row.errors or 0
      return {
          "total_requests": total,
          "successful": row.successful or 0,
          "errors": errors,
          "error_rate": (errors / total * 100) if total > 0 else 0,
          "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
          "p95_latency_ms": round(row.p95_latency_ms or 0, 2),
          "avg_ttft_ms": round(row.avg_ttft_ms or 0, 2),
          "total_tokens": row.total_tokens or 0,
          "total_cost_usd": round(row.total_cost_usd or 0, 6),
      }


@router.get("/throughput")
async def throughput(db: AsyncSession = Depends(get_db), session_id: str = Depends(get_session_id)):
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    minute = func.date_trunc("minute", InferenceLog.timestamp)
    query = select(
            minute.label("minute"),
            func.count(InferenceLog.id).label("requests"),
            func.coalesce(func.sum(InferenceLog.total_tokens), 0).label("tokens"),
        ).outerjoin(Conversation, InferenceLog.conversation_id == Conversation.id).where(InferenceLog.timestamp >= since)
    if session_id:
        query = query.where(Conversation.session_id == session_id)
    result = await db.execute(query.group_by(minute).order_by(minute))
    return [{"minute": str(r.minute), "requests": r.requests, "tokens": r.tokens} for r in result.all()]
