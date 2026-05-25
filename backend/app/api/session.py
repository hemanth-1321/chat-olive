import uuid
from fastapi import Request, Response


def get_session_id(request: Request, response: Response) -> str:
    session_id = request.cookies.get("session_id")
    if not session_id:
        session_id = str(uuid.uuid4())
        response.set_cookie("session_id", session_id, max_age=60 * 60 * 24 * 365, httponly=True, samesite="lax")
    return session_id
