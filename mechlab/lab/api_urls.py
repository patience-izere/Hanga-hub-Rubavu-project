from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from . import api_views
from .access_views import (
    ClassAccessListView,
    ClassBulkLearnersView,
    ClassJoinCodeView,
    ClassJoinView,
    LearnerPinResetView,
    OpenRegistrationView,
    SchoolRegistrationRequestView,
)
from .content_views import (
    AssetPackageAuthoringViewSet,
    AuthoringCourseViewSet,
    AuthoringLessonViewSet,
    GradingPolicyOptionsView,
    LessonTransitionView,
    ScenarioAuthoringViewSet,
)
from .learning_views import (
    AssignmentViewSet,
    AttemptViewSet,
    InstructorActivityView,
    InstructorAssignmentDetailView,
    InstructorAssignmentView,
    InstructorAttemptReviewDecisionView,
    InstructorAttemptReviewView,
    InstructorEvidenceExportView,
    InstructorFeedbackDetailView,
    InstructorLearnerDetailView,
    InstructorOverviewView,
    InstructorRosterView,
    ResearchConsentPolicyView,
    ResearchSurveyView,
)
from .open_views import (
    AttemptCertificateView,
    CatalogueEnrollView,
    CatalogueView,
    CertificateVerifyView,
    DemoLessonView,
    LiveClassBoardView,
    OpenStatusView,
    PublicCourseDetailView,
    PublicCourseListView,
    PublicLessonPracticeView,
)
from .pilot_views import PilotStudyViewSet
from .platform_views import (
    ContactMessageDetailView,
    ContactMessageView,
    PlatformSchoolDetailView,
    PlatformSchoolsView,
    RegistrationDecisionView,
)
from .school_views import (
    SchoolAuditExportView,
    SchoolAuditView,
    SchoolCohortDetailView,
    SchoolCohortListView,
    SchoolInvitationAcceptView,
    SchoolInvitationDetailView,
    SchoolInvitationListCreateView,
    SchoolMemberDetailView,
    SchoolMemberListView,
    SchoolMembersExportView,
    SchoolOverviewView,
)

router = DefaultRouter()
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("attempts", AttemptViewSet, basename="attempt")
router.register("content/scenarios", ScenarioAuthoringViewSet, basename="content-scenario")
router.register("content/courses", AuthoringCourseViewSet, basename="content-course")
router.register("content/lessons", AuthoringLessonViewSet, basename="content-lesson")
router.register(
    "content/asset-packages",
    AssetPackageAuthoringViewSet,
    basename="content-asset-package",
)
router.register("research/pilots", PilotStudyViewSet, basename="research-pilot")

urlpatterns = [
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("health/live/", api_views.health_live, name="api-health-live"),
    path("health/ready/", api_views.health_ready, name="api-health-ready"),
    path("monitoring/client-errors/", api_views.client_error, name="api-client-error"),
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
    path("auth/preferences/", api_views.preferences, name="api-auth-preferences"),
    path("auth/profile/", api_views.profile, name="api-auth-profile"),
    path("auth/register/", OpenRegistrationView.as_view(), name="api-auth-register"),
    path("auth/class/<str:code>/", ClassJoinView.as_view(), name="api-auth-class-join"),
    path("open/status/", OpenStatusView.as_view(), name="open-status"),
    path("demo/", DemoLessonView.as_view(), name="demo-lesson"),
    path("catalogue/", CatalogueView.as_view(), name="catalogue"),
    path(
        "catalogue/<int:lesson_id>/enroll/",
        CatalogueEnrollView.as_view(),
        name="catalogue-enroll",
    ),
    path(
        "attempts/<int:pk>/certificate/",
        AttemptCertificateView.as_view(),
        name="attempt-certificate",
    ),
    path(
        "certificates/verify/<str:code>/",
        CertificateVerifyView.as_view(),
        name="certificate-verify",
    ),
    path("schools/register/", SchoolRegistrationRequestView.as_view(), name="school-register"),
    path("courses/", PublicCourseListView.as_view(), name="public-courses"),
    path("courses/<slug:slug>/", PublicCourseDetailView.as_view(), name="public-course"),
    path(
        "courses/<slug:slug>/lessons/<int:lesson_id>/practice/",
        PublicLessonPracticeView.as_view(),
        name="public-lesson-practice",
    ),
    path("platform/schools/", PlatformSchoolsView.as_view(), name="platform-schools"),
    path("platform/schools/<int:pk>/", PlatformSchoolDetailView.as_view(), name="platform-school"),
    path("contact/", ContactMessageView.as_view(), name="contact-messages"),
    path("contact/<int:pk>/", ContactMessageDetailView.as_view(), name="contact-message"),
    path(
        "platform/registrations/<int:pk>/<str:decision>/",
        RegistrationDecisionView.as_view(),
        name="platform-registration-decision",
    ),
    path("classes/access/", ClassAccessListView.as_view(), name="class-access"),
    path("classes/<int:pk>/join-code/", ClassJoinCodeView.as_view(), name="class-join-code"),
    path("classes/<int:pk>/learners/", ClassBulkLearnersView.as_view(), name="class-learners"),
    path(
        "classes/learners/<int:pk>/reset-pin/",
        LearnerPinResetView.as_view(),
        name="class-learner-pin-reset",
    ),
    path("instructor/live/", LiveClassBoardView.as_view(), name="instructor-live-board"),
    path("instructor/overview/", InstructorOverviewView.as_view(), name="instructor-overview"),
    path("instructor/activity/", InstructorActivityView.as_view(), name="instructor-activity"),
    path("instructor/learners/", InstructorRosterView.as_view(), name="instructor-roster"),
    path(
        "instructor/learners/<int:pk>/",
        InstructorLearnerDetailView.as_view(),
        name="instructor-learner-detail",
    ),
    path(
        "research/consent-policy/",
        ResearchConsentPolicyView.as_view(),
        name="research-consent-policy",
    ),
    path(
        "instructor/evidence.csv",
        InstructorEvidenceExportView.as_view(),
        name="instructor-evidence-export",
    ),
    path(
        "instructor/assignments/",
        InstructorAssignmentView.as_view(),
        name="instructor-assignments",
    ),
    path("research/surveys/", ResearchSurveyView.as_view(), name="research-surveys"),
    path(
        "content/grading-policies/",
        GradingPolicyOptionsView.as_view(),
        name="content-grading-policies",
    ),
    path(
        "content/lessons/<int:pk>/transition/",
        LessonTransitionView.as_view(),
        name="content-lesson-transition",
    ),
    path("school/overview/", SchoolOverviewView.as_view(), name="school-overview"),
    path("school/audit/", SchoolAuditView.as_view(), name="school-audit"),
    path("school/audit/export/", SchoolAuditExportView.as_view(), name="school-audit-export"),
    path("school/members/export/", SchoolMembersExportView.as_view(), name="school-members-export"),
    path("school/cohorts/", SchoolCohortListView.as_view(), name="school-cohort-list"),
    path("school/cohorts/<int:pk>/", SchoolCohortDetailView.as_view(), name="school-cohort-detail"),
    path("school/members/", SchoolMemberListView.as_view(), name="school-member-list"),
    path("school/members/<int:pk>/", SchoolMemberDetailView.as_view(), name="school-member-detail"),
    path(
        "school/invitations/",
        SchoolInvitationListCreateView.as_view(),
        name="school-invitation-list",
    ),
    path(
        "school/invitations/<int:pk>/",
        SchoolInvitationDetailView.as_view(),
        name="school-invitation-detail",
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
    path(
        "instructor/attempts/<int:pk>/review/",
        InstructorAttemptReviewDecisionView.as_view(),
        name="instructor-attempt-review-decision",
    ),
    path(
        "instructor/attempts/<int:pk>/feedback/<int:feedback_id>/",
        InstructorFeedbackDetailView.as_view(),
        name="instructor-feedback-detail",
    ),
    path(
        "instructor/assignments/<int:pk>/",
        InstructorAssignmentDetailView.as_view(),
        name="instructor-assignment-detail",
    ),
    path("", include(router.urls)),
]
