from django.conf import settings
from django.shortcuts import redirect


def home(request):
    return redirect(f"{settings.FRONTEND_URL.rstrip('/')}/")
