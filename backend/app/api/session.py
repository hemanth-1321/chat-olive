from fastapi import Request


def get_session_id(request: Request) -> str:
    return request.headers.get("x-session-id", "")
