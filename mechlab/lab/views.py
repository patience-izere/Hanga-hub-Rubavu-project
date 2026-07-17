from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.views.decorators.http import require_POST


def _frontend_redirect(path: str):
    return redirect(f"{settings.FRONTEND_URL.rstrip('/')}{path}")


def home(request):
    return _frontend_redirect("/")


def login_view(request):
    return _frontend_redirect("/login")


def signup_view(request):
    return _frontend_redirect("/onboarding")


@require_POST
def logout_view(request):
    logout(request)
    return _frontend_redirect("/login")


def lab_view(request):
    return _frontend_redirect("/dashboard")


def support(request):
    return _frontend_redirect("/support")
