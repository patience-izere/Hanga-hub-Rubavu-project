from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("lab/", views.lab_view, name="lab"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("signup/", views.signup_view, name="signup"),
    path("support/", views.support, name="support"),
]
