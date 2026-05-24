from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
  
from app.db.database import get_db
from app.db.models import InferenceLog
  
router = APIRouter()
  
  
@router.get("/")
async def list_logs(
      limit: int = Query(100, le=500),
      offset: int = Query(0),
      model: str | None = None,
      status: str | None = None,
      db: AsyncSession = Depends(get_db),
  ):
      query = select(InferenceLog).order_by(InferenceLog.timestamp.desc())
      if model:
          query = query.where(InferenceLog.model == model)
      if status:
          query = query.where(InferenceLog.status == status)
      query = query.offset(offset).limit(limit)
      result = await db.execute(query)
      return result.scalars().all()
  