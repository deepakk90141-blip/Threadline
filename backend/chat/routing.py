from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # One socket per user for the whole session: presence + new-message alerts
    re_path(r"^ws/notifications/$", consumers.NotificationConsumer.as_asgi()),
    # One socket per open conversation: messages, typing, read receipts
    re_path(r"^ws/chat/(?P<conversation_id>\d+)/$", consumers.ChatConsumer.as_asgi()),
]
