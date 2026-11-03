import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "chatproject.settings")

# Initialise Django first, before importing anything that touches the ORM.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

import chat.routing  # noqa: E402
from chat.middleware import TokenAuthMiddleware  # noqa: E402


def _reset_presence_in_dev():
    """After a dev-server restart no sockets are connected, so nobody is
    online. Clears stale `is_online=True` flags left by a killed server."""
    try:
        from chat.models import Profile

        Profile.objects.filter(is_online=True).update(is_online=False)
    except Exception:  # tables may not exist before the first migrate
        pass


if settings.DEBUG:
    _reset_presence_in_dev()

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            TokenAuthMiddleware(URLRouter(chat.routing.websocket_urlpatterns))
        ),
    }
)
