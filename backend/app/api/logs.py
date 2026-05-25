from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import InferenceLog, Conversation
from app.api.session import get_session_id

router = APIRouter()


@router.get("/")
async def list_logs(
      limit: int = Query(100, le=500),
      offset: int = Query(0),
      model: str | None = None,
      status: str | None = None,
      db: AsyncSession = Depends(get_db),
      session_id: str = Depends(get_session_id),
  ):
      query = select(InferenceLog).join(Conversation, InferenceLog.conversation_id == Conversation.id).order_by(InferenceLog.timestamp.desc())
      if session_id:
          query = query.where(Conversation.session_id == session_id)
      if model:
          query = query.where(InferenceLog.model == model)
      if status:
          query = query.where(InferenceLog.status == status)
      query = query.offset(offset).limit(limit)
      result = await db.execute(query)
      return result.scalars().all()
