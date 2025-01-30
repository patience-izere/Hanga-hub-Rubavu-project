# lab/routing.py

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/live-chat/$', consumers.LiveChatConsumer.as_asgi()),
]
