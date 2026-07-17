from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from . import api_views
from .asset_views import ThreeDModelViewSet
from .learning_views import (
    AssignmentViewSet,
    AttemptViewSet,
    InstructorAttemptReviewView,
    InstructorOverviewView,
)
from .school_views import (
    SchoolInvitationAcceptView,
    SchoolInvitationListCreateView,
    SchoolMemberDetailView,
    SchoolMemberListView,
)

router = DefaultRouter()
router.register("models", ThreeDModelViewSet, basename="model")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("attempts", AttemptViewSet, basename="attempt")

urlpatterns = [
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("health/live/", api_views.health_live, name="api-health-live"),
    path("health/ready/", api_views.health_ready, name="api-health-ready"),
    path("auth/csrf/", api_views.csrf, name="api-auth-csrf"),
    path("auth/me/", api_views.me, name="api-auth-me"),
    path("auth/login/", api_views.login_api, name="api-auth-login"),
    path("auth/logout/", api_views.logout_api, name="api-auth-logout"),
    path("auth/password/change/", api_views.password_change, name="api-password-change"),
    path(
        "auth/password/reset/",
        api_views.password_reset_request,
        name="api-password-reset-request",
    ),
    path(
        "auth/password/reset/<str:uidb64>/<str:token>/",
        api_views.password_reset_confirm,
        name="api-password-reset-confirm",
    ),
    path("instructor/overview/", InstructorOverviewView.as_view(), name="instructor-overview"),
    path("school/members/", SchoolMemberListView.as_view(), name="school-member-list"),
    path("school/members/<int:pk>/", SchoolMemberDetailView.as_view(), name="school-member-detail"),
    path(
        "school/invitations/",
        SchoolInvitationListCreateView.as_view(),
        name="school-invitation-list",
    ),
    path(
        "school/invitations/accept/<str:token>/",
        SchoolInvitationAcceptView.as_view(),
        name="school-invitation-accept",
    ),
    path(
        "instructor/attempts/<int:pk>/",
        InstructorAttemptReviewView.as_view(),
        name="instructor-attempt-review",
    ),
    path("", include(router.urls)),
]
