from uuid import UUID
from fastapi import APIRouter, Depends,HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from app.db.database import get_db
from app.db.models import Conversation
from app.api.session import get_session_id

router = APIRouter()

@router.get("/")
async def list_conversations(db:AsyncSession = Depends(get_db), session_id: str = Depends(get_session_id)):
    result = await db.execute(select(Conversation).where(Conversation.session_id == session_id).order_by(Conversation.updated_at.desc()))
    conversations = result.scalars().all()
    return conversations


@router.post("/")
async def create_conversation(data:dict,db:AsyncSession = Depends(get_db)):
    conversation = Conversation()
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation

@router.get("/{conversation_id}")
async def get_conversation(conversation_id:UUID, db:AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).options(selectinload(Conversation.messages)).where(Conversation.id == conversation_id))
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation

@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id:UUID, db:AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conversation)
    await db.commit()
    return {"detail": "Conversation deleted"}

@router.patch("/{conversation_id}/cancel")
async def cancel_conversation(conversation_id: UUID, db: AsyncSession = Depends(get_db)):
      result = await db.execute(
          update(Conversation)
          .where(Conversation.id == conversation_id)
          .values(status="cancelled")
          .returning(Conversation)
      )
      await db.commit()
      row = result.scalar_one_or_none()
      if not row:
          raise HTTPException(status_code=404, detail="Conversation not found")
      return row