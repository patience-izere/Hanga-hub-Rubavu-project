# lab/urls.py
from django.urls import path
from .views import get_lab_state, save_progress, index
from . import views

# lab/urls.py

from django.urls import path
from . import views

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ThreeDModelViewSet

router = DefaultRouter()
router.register(r'models', ThreeDModelViewSet)


urlpatterns = [
    path('', views.home, name='home'),                  # Home page
    path('lab/', views.lab_view, name='lab'),           # Lab page
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('signup/', views.signup_view, name='signup'),
    path('support/', views.support, name='support'),     # Support page
    path('live-chat/', views.live_chat, name='live_chat'),# Live Chat page
    path('api/', include(router.urls)),
]
