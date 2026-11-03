from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token


@database_sync_to_async
def get_user_from_token(token_key):
    try:
        token = Token.objects.select_related("user").get(key=token_key)
        return token.user
    except Token.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware(BaseMiddleware):
    """
    Authenticates a WebSocket connection using the same DRF auth token the
    React app already holds from REST login, e.g.:

        ws://127.0.0.1:8000/ws/chat/<conversation_id>/?token=<auth_token>

    The connection's `scope["user"]` is set to the real user, or to
    AnonymousUser if the token is missing/invalid. The consumer is
    responsible for rejecting anonymous connections.
    """

    async def __call__(self, scope, receive, send):
        query_string = parse_qs(scope["query_string"].decode())
        token_key = query_string.get("token", [None])[0]

        scope["user"] = (
            await get_user_from_token(token_key) if token_key else AnonymousUser()
        )
        return await super().__call__(scope, receive, send)
