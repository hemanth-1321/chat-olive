import json
import logging
import uuid

from fastapi import APIRouter, Depends,Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.db.database import get_db
from app.db.models import Conversation, Message
from app.sdk.llm_sdk import LLMWrapper
from app.api.session import get_session_id

logger = logging.getLogger(__name__)

router=APIRouter()
sdk=LLMWrapper()

@router.post("/send")
async def send_message(request:Request,db:AsyncSession=Depends(get_db), session_id: str = Depends(get_session_id)):
    body=await request.json()
    message_text=body["message"]
    model=body["model"]
    conversation_id=body.get("conversation_id")
    provider = "Groq"

    if not conversation_id:
        conv=Conversation(title=message_text[:50],model=model, provider=provider, session_id=session_id)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        conversation_id=str(conv.id)
    else:
        result=await db.execute(select(Conversation).where(Conversation.id==conversation_id))
        conv=result.scalar_one_or_none()
        if not conv:
            return {"error":"Conversation not found"}
        
    user_message=Message(conversation_id=uuid.UUID(conversation_id),role="user",content=message_text)
    db.add(user_message)
    await db.commit()

    result = await db.execute(
          select(Message)
          .where(Message.conversation_id == uuid.UUID(conversation_id))
          .order_by(Message.created_at.desc())
          .limit(10)
      )
    system_prompt = """You are Olive — a thoughtful AI assistant who values clarity over verbosity.

You are direct, honest, and occasionally warm. You don't perform enthusiasm you don't feel. You don't hedge everything with disclaimers. You speak like a knowledgeable friend who respects the other person's time.

Principles:
- Be concise by default. Expand only when asked or when the topic genuinely requires it.
- Honesty over sycophancy. If something is wrong, say so kindly.
- Show your reasoning when it helps. Skip it when it doesn't.
- You can say "I don't know" — it's more useful than a confident guess.
- Match the energy of the conversation. Casual gets casual. Technical gets precise.

You're running on multiple models (Groq) depending on what the user selected. You don't pretend to be one specific model — you're Olive regardless of the engine underneath."""

    history = [{"role": "system", "content": system_prompt}] + [{"role": m.role, "content": m.content} for m in reversed(result.scalars().all())]

    assistant_message_id=str(uuid.uuid4())
    full_response: list[str] = []

    async def save_message():
        content = "".join(full_response)
        if not content:
            return
        try:
            assistant_msg = Message(
                id=uuid.UUID(assistant_message_id),
                conversation_id=uuid.UUID(conversation_id),
                role="assistant",
                content=content,
            )
            db.add(assistant_msg)
            await db.execute(
                update(Conversation)
                .where(Conversation.id == uuid.UUID(conversation_id))
                .values(message_count=Conversation.message_count + 2)
            )
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error("Failed to persist assistant message. conversation=%s error=%s", conversation_id, str(e))

    async def event_stream():
        yield f"data: {json.dumps({'conversation_id': conversation_id, 'message_id': assistant_message_id})}\n\n"
        try:
            async for chunk in sdk.chat_stream(messages=history,model=model,provider=provider,conversation_id=conversation_id,message_id=assistant_message_id):
                if chunk.startswith("[Error]:"):
                    logger.error("LLM error for conversation=%s model=%s: %s", conversation_id, model, chunk)
                    yield f"data: {json.dumps({'error': 'Something went wrong. Please try again later.'})}\n\n"
                else:
                    full_response.append(chunk)
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error("Stream exception for conversation=%s: %s", conversation_id, str(e))
            yield f"data: {json.dumps({'error': 'Something went wrong. Please try again later.'})}\n\n"
        finally:
            await save_message()
        yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id, 'message_id': assistant_message_id})}\n\n"
  
    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/save")
async def save_partial(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    conversation_id = body.get("conversation_id")
    message_id = body.get("message_id")
    content = body.get("content", "")
    if not conversation_id or not content:
        return {"ok": False}
    try:
        existing = await db.execute(select(Message).where(Message.id == uuid.UUID(message_id)))
        if existing.scalar_one_or_none():
            return {"ok": True}
        msg = Message(id=uuid.UUID(message_id), conversation_id=uuid.UUID(conversation_id), role="assistant", content=content)
        db.add(msg)
        await db.execute(update(Conversation).where(Conversation.id == uuid.UUID(conversation_id)).values(message_count=Conversation.message_count + 2))
        await db.commit()
    except Exception:
        await db.rollback()
    return {"ok": True}
  