import hashlib
import json
import struct
import tempfile
import uuid
from datetime import timedelta
from io import StringIO
from pathlib import Path
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .models import (
    AcceptableAction,
    AssetFile,
    AssetPackage,
    Assignment,
    Attempt,
    AttemptEvent,
    AuditEvent,
    Cohort,
    Competency,
    Course,
    Enrollment,
    GradingPolicy,
    Hazard,
    InstructorProfile,
    LearnerProfile,
    Lesson,
    Module,
    PilotApproval,
    PilotObservation,
    PilotRehearsal,
    PilotReview,
    PilotStudy,
    ProcedureStep,
    Program,
    ResearchConsentReceipt,
    ResearchSurveyResponse,
    School,
    SchoolInvitation,
    SchoolMembership,
    SimulationScenario,
    StepFeedback,
    StepHint,
    StepResult,
    StepTolerance,
    Tool,
    XApiDelivery,
)
from .permissions import (
    IsContentAuthorOrSchoolAdmin,
    IsInstructorOrSchoolAdmin,
    IsLearner,
    IsPlatformAdministrator,
    IsSchoolAdmin,
    has_active_school_role,
)
from .research import research_participant_code
from .scenario_snapshots import build_scenario_definition


class RolePermissionTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Permission School", code="permission-school")

    def user_with_role(self, email, role):
        user = User.objects.create_user(username=email, email=email, password="test-pass-123")
        SchoolMembership.objects.create(school=self.school, user=user, role=role)
        return user

    @staticmethod
    def request_for(user):
        return SimpleNamespace(user=user)

    def test_platform_admin_requires_an_active_superuser(self):
        staff = User.objects.create_user("staff@example.com", is_staff=True)
        platform_admin = User.objects.create_superuser(
            "platform@example.com", "platform@example.com", "test-pass-123"
        )
        permission = IsPlatformAdministrator()
        self.assertFalse(permission.has_permission(self.request_for(staff), object()))
        self.assertTrue(permission.has_permission(self.request_for(platform_admin), object()))
        platform_admin.is_active = False
        platform_admin.save(update_fields=["is_active"])
        self.assertFalse(permission.has_permission(self.request_for(platform_admin), object()))
        self.assertFalse(IsSchoolAdmin().has_permission(self.request_for(platform_admin), object()))

    def test_school_roles_are_distinct_and_require_active_membership(self):
        admin = self.user_with_role("admin-role@example.com", SchoolMembership.Role.ADMIN)
        instructor = self.user_with_role(
            "instructor-role@example.com", SchoolMembership.Role.INSTRUCTOR
        )
        author = self.user_with_role(
            "author-role@example.com", SchoolMembership.Role.CONTENT_AUTHOR
        )
        learner = self.user_with_role("learner-role@example.com", SchoolMembership.Role.LEARNER)

        self.assertTrue(IsSchoolAdmin().has_permission(self.request_for(admin), object()))
        self.assertTrue(
            IsInstructorOrSchoolAdmin().has_permission(self.request_for(instructor), object())
        )
        self.assertTrue(
            IsContentAuthorOrSchoolAdmin().has_permission(self.request_for(author), object())
        )
        self.assertTrue(IsLearner().has_permission(self.request_for(learner), object()))
        self.assertFalse(IsSchoolAdmin().has_permission(self.request_for(instructor), object()))
        self.assertFalse(
            IsInstructorOrSchoolAdmin().has_permission(self.request_for(author), object())
        )
        self.assertFalse(IsLearner().has_permission(self.request_for(author), object()))

        membership = SchoolMembership.objects.get(user=learner, school=self.school)
        membership.is_active = False
        membership.save(update_fields=["is_active"])
        self.assertFalse(IsLearner().has_permission(self.request_for(learner), object()))

    def test_role_helper_can_require_a_specific_school(self):
        instructor = self.user_with_role(
            "scoped-instructor@example.com", SchoolMembership.Role.INSTRUCTOR
        )
        other_school = School.objects.create(
            name="Other Permission School", code="other-permission"
        )
        self.assertTrue(
            has_active_school_role(
                instructor, [SchoolMembership.Role.INSTRUCTOR], school=self.school
            )
        )
        self.assertFalse(
            has_active_school_role(
                instructor, [SchoolMembership.Role.INSTRUCTOR], school=other_school
            )
        )


@override_settings(ALLOWED_HOSTS=["testserver", "127.0.0.1", "localhost"])
class IntegrationTests(TestCase):
    def test_legacy_public_routes_redirect_to_react(self):
        redirects = [
            ("index_home", "http://localhost:5173/"),
            ("home", "http://localhost:5173/"),
            ("lab", "http://localhost:5173/dashboard"),
            ("login", "http://localhost:5173/login"),
            ("signup", "http://localhost:5173/onboarding"),
            ("support", "http://localhost:5173/support"),
        ]
        for route_name, destination in redirects:
            with self.subTest(route_name=route_name):
                self.assertRedirects(
                    self.client.get(reverse(route_name)),
                    destination,
                    fetch_redirect_response=False,
                )

    def test_legacy_posts_cannot_create_or_authenticate_accounts(self):
        email = "loginflow@example.com"
        password = "letmein123"
        user = User.objects.create_user(username=email, email=email, password=password)
        self.assertRedirects(
            self.client.post(reverse("login"), {"username": email, "password": password}),
            "http://localhost:5173/login",
            fetch_redirect_response=False,
        )
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertRedirects(
            self.client.post(reverse("signup"), {"email": "blocked@example.com"}),
            "http://localhost:5173/onboarding",
            fetch_redirect_response=False,
        )
        self.assertFalse(User.objects.filter(username="blocked@example.com").exists())

        self.client.force_login(user)
        self.assertRedirects(
            self.client.post(reverse("logout")),
            "http://localhost:5173/login",
            fetch_redirect_response=False,
        )
        self.assertNotIn("_auth_user_id", self.client.session)


@override_settings(ALLOWED_HOSTS=["testserver"])
class ApiAuthenticationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.email = "api-user@example.com"
        self.password = "a-strong-test-password-123"
        self.user = User.objects.create_user(
            username=self.email,
            email=self.email,
            password=self.password,
            first_name="API",
            last_name="Learner",
        )
        self.school = School.objects.create(name="Rubavu TSS", code="rubavu-auth")
        SchoolMembership.objects.create(
            school=self.school,
            user=self.user,
            role=SchoolMembership.Role.LEARNER,
        )
        LearnerProfile.objects.create(user=self.user, student_id="AUTH-LEARNER")
        self.client = Client(enforce_csrf_checks=True)

    def test_health_endpoints_are_public(self):
        live = self.client.get(reverse("api-health-live"))
        ready = self.client.get(reverse("api-health-ready"))
        self.assertEqual(live.status_code, 200)
        self.assertEqual(live.json()["service"], "opedu-api")
        self.assertEqual(ready.status_code, 200)

    def test_client_error_monitoring_is_authenticated_csrf_protected_and_minimal(self):
        url = reverse("api-client-error")
        payload = {
            "eventId": str(uuid.uuid4()),
            "kind": "component_error",
            "route": "/attempts/42",
            "release": "test-release",
            "message": "This deliberately must not be logged",
            "stack": "This deliberately must not be logged",
        }
        self.assertEqual(
            self.client.post(url, data=payload, content_type="application/json").status_code,
            403,
        )
        self.client.force_login(self.user)
        self.client.get(reverse("api-auth-csrf"))
        token = self.client.cookies["csrftoken"].value
        with self.assertLogs("opedu.client_errors", level="ERROR") as captured:
            response = self.client.post(
                url,
                data=payload,
                content_type="application/json",
                HTTP_X_CSRFTOKEN=token,
            )
        self.assertEqual(response.status_code, 202)
        self.assertIn('"event":"browser_error"', captured.output[0])
        self.assertIn('"route":"/attempts/42"', captured.output[0])
        self.assertNotIn("deliberately", captured.output[0])

        payload["route"] = "/attempts/42?learner=private"
        rejected = self.client.post(
            url,
            data=payload,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(rejected.status_code, 400)

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("api-auth-me"))
        self.assertEqual(response.status_code, 401)

    def test_me_reports_the_platform_administrator_role(self):
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save(update_fields=["is_staff", "is_superuser"])
        self.client.force_login(self.user)
        response = self.client.get(reverse("api-auth-me"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["roles"], ["platform_admin", "learner"])

    def test_login_requires_csrf_and_returns_current_user(self):
        payload = {"email": self.email, "password": self.password}
        rejected = self.client.post(
            reverse("api-auth-login"),
            data=payload,
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 403)

        csrf_response = self.client.get(reverse("api-auth-csrf"))
        self.assertEqual(csrf_response.status_code, 200)
        token = self.client.cookies["csrftoken"].value
        accepted = self.client.post(
            reverse("api-auth-login"),
            data=payload,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["user"]["email"], self.email)
        self.assertEqual(accepted.json()["user"]["organization"], "Rubavu TSS")

        me = self.client.get(reverse("api-auth-me"))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["user"]["firstName"], "API")
        self.assertEqual(me.json()["user"]["roles"], ["learner"])

    def test_invalid_credentials_are_rejected(self):
        self.client.get(reverse("api-auth-csrf"))
        token = self.client.cookies["csrftoken"].value
        response = self.client.post(
            reverse("api-auth-login"),
            data={"email": self.email, "password": "wrong"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 401)

    def test_login_accepts_email_when_username_is_different(self):
        self.user.username = "api-user"
        self.user.save(update_fields=["username"])
        self.client.get(reverse("api-auth-csrf"))
        token = self.client.cookies["csrftoken"].value

        response = self.client.post(
            reverse("api-auth-login"),
            data={"email": self.email, "password": self.password},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], "api-user")

    @override_settings(LOGIN_FAILURE_LIMIT=2, LOGIN_LOCKOUT_SECONDS=60)
    def test_repeated_login_failures_are_temporarily_locked(self):
        self.client.get(reverse("api-auth-csrf"))
        token = self.client.cookies["csrftoken"].value
        for expected_status in [401, 401, 429]:
            response = self.client.post(
                reverse("api-auth-login"),
                data={"email": self.email, "password": "wrong"},
                content_type="application/json",
                HTTP_X_CSRFTOKEN=token,
            )
            self.assertEqual(response.status_code, expected_status)
        self.assertEqual(response.json()["code"], "login_locked")

    def test_password_change_preserves_session_and_creates_audit_event(self):
        self.client.get(reverse("api-auth-csrf"))
        token = self.client.cookies["csrftoken"].value
        login_response = self.client.post(
            reverse("api-auth-login"),
            data={"email": self.email, "password": self.password},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(login_response.status_code, 200)
        token = self.client.cookies["csrftoken"].value
        response = self.client.post(
            reverse("api-password-change"),
            data={
                "currentPassword": self.password,
                "newPassword": "a-new-strong-test-password-456",
            },
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(reverse("api-auth-me")).status_code, 200)
        self.assertTrue(
            AuditEvent.objects.filter(
                event_type="account.password_changed",
                actor=self.user,
            ).exists()
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_reset_is_non_enumerating_and_accepts_a_valid_token(self):
        self.client.get(reverse("api-auth-csrf"))
        csrf_token = self.client.cookies["csrftoken"].value
        unknown = self.client.post(
            reverse("api-password-reset-request"),
            data={"email": "missing@example.com"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        known = self.client.post(
            reverse("api-password-reset-request"),
            data={"email": self.email},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(unknown.json(), known.json())
        self.assertEqual(len(mail.outbox), 1)

        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        confirmed = self.client.post(
            reverse("api-password-reset-confirm", args=[uid, token]),
            data={"newPassword": "reset-to-a-strong-password-789"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(confirmed.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("reset-to-a-strong-password-789"))


class CurriculumDomainTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Curriculum School", code="curriculum-school")
        self.other_school = School.objects.create(name="Other School", code="curriculum-other")
        self.program = Program.objects.create(
            school=self.school,
            code="automotive",
            name="Automobile Technology",
        )
        self.other_program = Program.objects.create(
            school=self.other_school,
            code="electrical",
            name="Electrical Technology",
        )
        self.learner = User.objects.create_user("curriculum-learner@example.com")
        SchoolMembership.objects.create(
            school=self.school,
            user=self.learner,
            role=SchoolMembership.Role.LEARNER,
        )
        self.course = Course.objects.create(
            school=self.school,
            program=self.program,
            title="Automotive Foundations",
            slug="curriculum-automotive-foundations",
            trade="Automobile Technology",
        )
        self.module = Module.objects.create(
            course=self.course,
            code="battery-systems",
            title="Battery Systems",
            order=1,
        )
        self.cohort = Cohort.objects.create(
            school=self.school,
            program=self.program,
            code="auto-2026",
            name="Automotive 2026",
            academic_year="2026",
        )

    def test_curriculum_hierarchy_rejects_cross_school_and_cross_course_links(self):
        with self.assertRaises(ValidationError):
            Course.objects.create(
                school=self.school,
                program=self.other_program,
                title="Invalid course",
                slug="invalid-cross-school-course",
                trade="Invalid",
            )
        with self.assertRaises(ValidationError):
            Cohort.objects.create(
                school=self.school,
                program=self.other_program,
                code="invalid-cohort",
                name="Invalid cohort",
            )

        other_course = Course.objects.create(
            school=self.other_school,
            program=self.other_program,
            title="Electrical Foundations",
            slug="curriculum-electrical-foundations",
            trade="Electrical Technology",
        )
        other_module = Module.objects.create(
            course=other_course,
            code="wiring",
            title="Wiring",
            order=1,
        )
        with self.assertRaises(ValidationError):
            Lesson.objects.create(
                course=self.course,
                module=other_module,
                title="Invalid lesson",
                slug="invalid-cross-course-lesson",
                summary="Invalid hierarchy",
            )

    def test_enrollment_requires_an_active_learner_membership_in_the_same_school(self):
        enrollment = Enrollment.objects.create(cohort=self.cohort, learner=self.learner)
        self.assertEqual(enrollment.status, Enrollment.Status.ACTIVE)

        outsider = User.objects.create_user("curriculum-outsider@example.com")
        SchoolMembership.objects.create(
            school=self.other_school,
            user=outsider,
            role=SchoolMembership.Role.LEARNER,
        )
        with self.assertRaises(ValidationError):
            Enrollment.objects.create(cohort=self.cohort, learner=outsider)

    def test_role_profiles_validate_fields_without_birth_date_or_phone(self):
        learner_profile = LearnerProfile.objects.create(
            user=self.learner,
            student_id="AUTO-001",
            preferred_language=LearnerProfile.Language.KINYARWANDA,
        )
        self.assertEqual(learner_profile.preferred_language, "rw")
        learner_fields = {field.name for field in LearnerProfile._meta.fields}
        self.assertNotIn("birth_date", learner_fields)
        self.assertNotIn("phone_number", learner_fields)

        instructor = User.objects.create_user("curriculum-instructor@example.com")
        profile = InstructorProfile(user=instructor, qualifications={"invalid": "mapping"})
        with self.assertRaises(ValidationError):
            profile.save()

    def test_competency_metadata_and_lesson_prerequisites_are_structured(self):
        competency = Competency.objects.create(
            course=self.course,
            code="AUTO-CURRICULUM-01",
            title="Use electrical evidence",
            curriculum_reference="CURRICULUM-AUTO-01",
            level=2,
            evidence_rules=[{"event": "step_completed", "required": True}],
            mastery_criteria=["Completes the required evidence step."],
            mastery_threshold=85,
        )
        self.assertEqual(competency.level, 2)
        invalid = Competency(
            course=self.course,
            code="INVALID-EVIDENCE",
            title="Invalid evidence",
            evidence_rules={"not": "a list"},
        )
        with self.assertRaises(ValidationError):
            invalid.save()

        prerequisite = Lesson.objects.create(
            course=self.course,
            module=self.module,
            title="Electrical safety prerequisite",
            slug="electrical-safety-prerequisite",
            summary="Prepare safely.",
            language=Lesson.Language.KINYARWANDA,
        )
        advanced = Lesson.objects.create(
            course=self.course,
            module=self.module,
            title="Advanced diagnosis",
            slug="advanced-diagnosis",
            summary="Diagnose with evidence.",
            content_version=2,
        )
        advanced.prerequisites.add(prerequisite)
        self.assertEqual(list(advanced.prerequisites.all()), [prerequisite])
        self.assertEqual(prerequisite.language, "rw")


class SeedDemoTests(TestCase):
    def test_seed_builds_the_normalized_workflow_idempotently(self):
        output = StringIO()
        for _ in range(2):
            call_command(
                "seed_demo",
                password="seed-domain-test-password-123",
                stdout=output,
            )

        self.assertEqual(Program.objects.count(), 1)
        self.assertEqual(Cohort.objects.count(), 1)
        self.assertEqual(Enrollment.objects.count(), 1)
        self.assertEqual(Module.objects.count(), 1)
        self.assertEqual(LearnerProfile.objects.count(), 1)
        self.assertEqual(InstructorProfile.objects.count(), 1)
        course = Course.objects.get()
        lesson = Lesson.objects.get()
        self.assertEqual(course.program, Program.objects.get())
        self.assertEqual(lesson.module, Module.objects.get())
        scenario = SimulationScenario.objects.get()
        self.assertEqual(scenario.lesson, lesson)
        self.assertEqual(scenario.version, lesson.content_version)
        self.assertEqual(scenario.status, SimulationScenario.Status.PUBLISHED)
        self.assertEqual(len(scenario.definition["steps"]), 7)
        self.assertEqual(scenario.definition["format"], "opedu-scenario/v2")
        self.assertEqual(Tool.objects.count(), 2)
        self.assertEqual(Hazard.objects.count(), 2)
        self.assertEqual(AcceptableAction.objects.count(), 7)
        self.assertEqual(StepHint.objects.count(), 2)
        self.assertEqual(StepTolerance.objects.count(), 1)
        self.assertEqual(scenario.grading_policy.version, 1)
        self.assertEqual(AssetPackage.objects.get().version, 1)
        assignment = Assignment.objects.get()
        self.assertEqual(assignment.scenario, scenario)


class AssetGovernanceCommandTests(TestCase):
    def test_public_unversioned_3d_asset_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            base_dir = Path(temporary_directory)
            public_models = base_dir / "static" / "lab" / "models"
            public_models.mkdir(parents=True)
            (public_models / "unlicensed.glb").write_bytes(b"unverified")

            with override_settings(BASE_DIR=base_dir), self.assertRaises(CommandError):
                call_command("validate_asset_packages", stdout=StringIO(), stderr=StringIO())

    def test_legacy_unscoped_3d_model_endpoint_is_retired(self):
        """The legacy endpoint listed every model to every school; AssetPackage replaces it."""

        user = User.objects.create_user(
            username="legacy-asset@example.com",
            email="legacy-asset@example.com",
            password="a-strong-test-password-123",
        )
        school = School.objects.create(name="Legacy Asset School", code="legacy-asset-school")
        SchoolMembership.objects.create(
            school=school,
            user=user,
            role=SchoolMembership.Role.LEARNER,
        )
        self.client.force_login(user)

        for path in ("/api/v1/models/", "/api/v1/models/1/"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)


class VersionedSimulationTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Version School", code="version-school")
        self.course = Course.objects.create(
            school=self.school,
            title="Versioned Automotive",
            slug="versioned-automotive",
            trade="Automotive",
        )
        self.lesson = Lesson.objects.create(
            course=self.course,
            title="Versioned lesson",
            slug="versioned-lesson",
            summary="A versioned practical lesson.",
        )
        self.policy = GradingPolicy.objects.create(
            code="version-test",
            version=1,
            name="Version test policy",
            status=GradingPolicy.Status.PUBLISHED,
        )
        self.package = AssetPackage.objects.create(
            course=self.course,
            code="workshop",
            version=1,
            name="Workshop package",
            manifest={"format": "opedu-asset-package/v1"},
            sha256="a" * 64,
        )
        self.asset_file = AssetFile.objects.create(
            package=self.package,
            path="models/battery.glb",
            mime_type="model/gltf-binary",
            byte_size=1024,
            sha256="b" * 64,
            role="primary-scene",
        )
        self.package.status = AssetPackage.Status.PUBLISHED
        self.package.save()
        self.scenario = SimulationScenario.objects.create(
            lesson=self.lesson,
            version=1,
            title="Versioned scenario",
            definition={
                "format": "opedu-scenario/v1",
                "steps": [
                    {
                        "order": 1,
                        "code": "inspect",
                        "title": "Inspect",
                        "instruction": "Inspect the battery.",
                        "action_code": "inspect_battery",
                        "feedback": "Inspection complete.",
                    }
                ],
            },
            grading_policy=self.policy,
            asset_package=self.package,
            status=SimulationScenario.Status.PUBLISHED,
        )

    def test_published_versions_and_asset_files_are_immutable(self):
        self.scenario.title = "Changed in place"
        with self.assertRaisesMessage(ValidationError, "cannot be edited in place"):
            self.scenario.save()

        self.policy.safety_critical_penalty = 99
        with self.assertRaisesMessage(ValidationError, "cannot be edited in place"):
            self.policy.save()

        self.package.manifest = {"changed": True}
        with self.assertRaisesMessage(ValidationError, "cannot be edited in place"):
            self.package.save()

        self.asset_file.byte_size = 2048
        with self.assertRaisesMessage(ValidationError, "cannot be changed"):
            self.asset_file.save()
        with self.assertRaisesMessage(ValidationError, "cannot be deleted"):
            self.asset_file.delete()

    def test_scenario_rejects_an_asset_package_from_another_course(self):
        other_course = Course.objects.create(
            school=self.school,
            title="Other course",
            slug="other-versioned-course",
            trade="Automotive",
        )
        other_package = AssetPackage.objects.create(
            course=other_course,
            code="other",
            version=1,
            name="Other package",
            manifest={},
            sha256="c" * 64,
            status=AssetPackage.Status.PUBLISHED,
        )
        invalid = SimulationScenario(
            lesson=self.lesson,
            version=2,
            title="Invalid package scenario",
            definition=self.scenario.definition,
            grading_policy=self.policy,
            asset_package=other_package,
        )
        with self.assertRaises(ValidationError):
            invalid.save()


class VersioningMigrationTests(TransactionTestCase):
    migrate_from = ("lab", "0009_lesson_governance")
    migrate_to = ("lab", "0011_assessment_evidence")

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps

        User = old_apps.get_model("auth", "User")
        School = old_apps.get_model("lab", "School")
        Course = old_apps.get_model("lab", "Course")
        Lesson = old_apps.get_model("lab", "Lesson")
        Competency = old_apps.get_model("lab", "Competency")
        ProcedureStep = old_apps.get_model("lab", "ProcedureStep")
        Assignment = old_apps.get_model("lab", "Assignment")
        Attempt = old_apps.get_model("lab", "Attempt")
        AttemptEvent = old_apps.get_model("lab", "AttemptEvent")

        user = User.objects.create(username="historical-learner")
        school = School.objects.create(name="Historical School", code="historical-school")
        course = Course.objects.create(
            school_id=school.pk,
            title="Historical course",
            slug="historical-course",
            trade="Automotive",
        )
        self.course = course
        lesson = Lesson.objects.create(
            course_id=course.pk,
            title="Historical lesson",
            slug="historical-lesson",
            summary="Created before versioned scenarios.",
            content_version=3,
            status="published",
        )
        competency = Competency.objects.create(
            course_id=course.pk,
            code="HIST-01",
            title="Historical competency",
            mastery_threshold=80,
        )
        lesson.competencies.add(competency)
        ProcedureStep.objects.create(
            lesson_id=lesson.pk,
            order=1,
            code="historical-step",
            title="Historical step",
            instruction="Complete the historical action.",
            action_code="historical_action",
            feedback="Historical feedback.",
        )
        assignment = Assignment.objects.create(
            lesson_id=lesson.pk,
            learner_id=user.pk,
            assigned_by_id=user.pk,
        )
        attempt = Attempt.objects.create(
            assignment_id=assignment.pk,
            learner_id=user.pk,
            status="completed",
            score=100,
            completed_at=timezone.now(),
        )
        self.attempt_pk = attempt.pk
        AttemptEvent.objects.create(
            attempt_id=attempt.pk,
            sequence=1,
            event_type="attempt_started",
            payload={"lessonId": lesson.pk},
        )
        AttemptEvent.objects.create(
            attempt_id=attempt.pk,
            sequence=2,
            event_type="step_completed",
            payload={"stepCode": "historical-step", "points": 10},
        )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_existing_attempts_receive_reproducible_version_references(self):
        Attempt = self.apps.get_model("lab", "Attempt")
        attempt = Attempt.objects.select_related("scenario", "grading_policy").get(
            pk=self.attempt_pk
        )
        self.assertEqual(attempt.scenario.version, 3)
        self.assertEqual(attempt.grading_policy.version, 1)
        self.assertEqual(attempt.outcome, "mastered")
        self.assertEqual(attempt.step_results.count(), 1)
        self.assertEqual(attempt.competency_results.count(), 1)
        self.assertEqual(
            attempt.scenario.definition["steps"][0]["action_code"],
            "historical_action",
        )


@override_settings(ALLOWED_HOSTS=["testserver"])
class ContentWorkflowTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Workflow School", code="workflow-school")
        self.other_school = School.objects.create(name="Other Workflow", code="workflow-other")
        self.author = User.objects.create_user("author@example.com", password="password-123")
        self.admin = User.objects.create_user("workflow-admin@example.com", password="password-123")
        self.other_author = User.objects.create_user(
            "other-author@example.com", password="password-123"
        )
        self.instructor = User.objects.create_user(
            "workflow-instructor@example.com", password="password-123"
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=self.author,
            role=SchoolMembership.Role.CONTENT_AUTHOR,
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=self.admin,
            role=SchoolMembership.Role.ADMIN,
        )
        SchoolMembership.objects.create(
            school=self.other_school,
            user=self.other_author,
            role=SchoolMembership.Role.CONTENT_AUTHOR,
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=self.instructor,
            role=SchoolMembership.Role.INSTRUCTOR,
        )
        program = Program.objects.create(
            school=self.school,
            code="workflow-program",
            name="Workflow Program",
        )
        course = Course.objects.create(
            school=self.school,
            program=program,
            title="Workflow Course",
            slug="workflow-course",
            trade="Automotive",
        )
        self.course = course
        self.lesson = Lesson.objects.create(
            course=course,
            authored_by=self.author,
            title="Workflow Lesson",
            slug="workflow-lesson",
            summary="A governed lesson.",
        )
        self.url = f"/api/v1/content/lessons/{self.lesson.pk}/transition/"

    def transition(self, user, action, **payload):
        self.client.force_login(user)
        return self.client.post(
            self.url,
            {"action": action, **payload},
            content_type="application/json",
        )

    def test_author_submits_and_admin_approves_publishes_and_retires(self):
        submitted = self.transition(self.author, "submit")
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.json()["status"], Lesson.Status.REVIEW)

        self.assertEqual(self.transition(self.author, "approve").status_code, 403)
        approved = self.transition(self.admin, "approve", reviewNotes="Ready for release.")
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["status"], Lesson.Status.APPROVED)
        published = self.transition(self.admin, "publish")
        self.assertEqual(published.status_code, 200)
        self.assertIsNotNone(published.json()["publishedAt"])
        retired = self.transition(self.admin, "retire")
        self.assertEqual(retired.status_code, 200)
        self.assertEqual(retired.json()["status"], Lesson.Status.RETIRED)
        self.assertEqual(
            AuditEvent.objects.filter(
                target_id=str(self.lesson.pk), target_type="lab.lesson"
            ).count(),
            4,
        )

    def test_review_return_requires_notes_and_resubmission(self):
        self.transition(self.author, "submit")
        missing_notes = self.transition(self.admin, "return_to_draft")
        self.assertEqual(missing_notes.status_code, 400)
        returned = self.transition(
            self.admin,
            "return_to_draft",
            reviewNotes="Add a clearer safety prerequisite.",
        )
        self.assertEqual(returned.status_code, 200)
        self.assertEqual(returned.json()["status"], Lesson.Status.DRAFT)
        self.assertEqual(returned.json()["reviewNotes"], "Add a clearer safety prerequisite.")
        self.assertEqual(self.transition(self.author, "submit").status_code, 200)

    def test_workflow_is_school_scoped_and_excludes_instructors(self):
        self.assertEqual(self.transition(self.other_author, "submit").status_code, 404)
        self.assertEqual(self.transition(self.instructor, "submit").status_code, 403)

    def test_author_can_create_preview_clone_and_admin_publish_scenario(self):
        self.transition(self.author, "submit")
        self.transition(self.admin, "approve", reviewNotes="Lesson is ready.")
        self.transition(self.admin, "publish")
        policy = GradingPolicy.objects.create(
            code="workflow-policy",
            version=1,
            name="Workflow policy",
            status=GradingPolicy.Status.PUBLISHED,
        )
        payload = {
            "lesson": self.lesson.pk,
            "version": 1,
            "title": "Authoring scenario",
            "definition": {
                "format": "opedu-scenario/v2",
                "renderers": {"accessible_2d": {"required": True, "evidenceParity": True}},
                "steps": [
                    {
                        "order": 1,
                        "code": "safe-start",
                        "title": "Make safe",
                        "instruction": "Confirm the training rig is de-energized.",
                        "action_code": "confirm_safe",
                        "acceptable_actions": [
                            {
                                "action_code": "confirm_safe",
                                "label": "Confirm safe",
                                "is_primary": True,
                            }
                        ],
                        "tools": [],
                        "hazards": [],
                        "hints": [],
                        "competency_codes": ["safe-working"],
                    }
                ],
                "fallback": {
                    "mode": "accessible_2d",
                    "preserveAttempt": True,
                    "trackingFailureAffectsGrade": False,
                },
            },
            "grading_policy": policy.pk,
            "asset_package": None,
        }
        self.client.force_login(self.author)
        created = self.client.post(
            "/api/v1/content/scenarios/",
            payload,
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        scenario_id = created.json()["id"]
        self.assertEqual(created.json()["status"], SimulationScenario.Status.DRAFT)
        clone = self.client.post(f"/api/v1/content/scenarios/{scenario_id}/clone-draft/")
        self.assertEqual(clone.status_code, 201)
        self.assertEqual(clone.json()["version"], 2)
        self.assertEqual(
            self.client.post(f"/api/v1/content/scenarios/{scenario_id}/publish/").status_code,
            403,
        )
        submitted = self.client.post(
            f"/api/v1/content/scenarios/{scenario_id}/transition/",
            {"action": "submit"},
            content_type="application/json",
        )
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.json()["status"], SimulationScenario.Status.REVIEW)

        self.client.force_login(self.admin)
        approved = self.client.post(
            f"/api/v1/content/scenarios/{scenario_id}/transition/",
            {"action": "approve", "reviewNotes": "Validated against the procedure."},
            content_type="application/json",
        )
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()["status"], SimulationScenario.Status.APPROVED)
        published = self.client.post(f"/api/v1/content/scenarios/{scenario_id}/publish/")
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.json()["status"], SimulationScenario.Status.PUBLISHED)

    def test_scenario_publication_rejects_missing_fallback_and_competency_evidence(self):
        self.transition(self.author, "submit")
        self.transition(self.admin, "approve")
        self.transition(self.admin, "publish")
        policy = GradingPolicy.objects.create(
            code="invalid-workflow-policy",
            version=1,
            name="Invalid workflow policy",
            status=GradingPolicy.Status.PUBLISHED,
        )
        self.client.force_login(self.author)
        response = self.client.post(
            "/api/v1/content/scenarios/",
            {
                "lesson": self.lesson.pk,
                "version": 1,
                "title": "Incomplete scenario",
                "definition": {
                    "format": "opedu-scenario/v2",
                    "steps": [
                        {
                            "order": 1,
                            "code": "unsafe",
                            "title": "Unsafe",
                            "instruction": "Incomplete evidence.",
                            "action_code": "unsafe",
                        }
                    ],
                },
                "grading_policy": policy.pk,
                "asset_package": None,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        scenario_id = response.json()["id"]
        self.client.post(
            f"/api/v1/content/scenarios/{scenario_id}/transition/",
            {"action": "submit"},
            content_type="application/json",
        )
        self.client.force_login(self.admin)
        approval = self.client.post(
            f"/api/v1/content/scenarios/{scenario_id}/transition/",
            {"action": "approve"},
            content_type="application/json",
        )
        self.assertEqual(approval.status_code, 400)
        self.assertIn("publication", approval.json())

    def test_asset_upload_validates_glb_license_checksum_and_admin_publication(self):
        temporary_media = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_media.cleanup)
        settings_override = self.settings(MEDIA_ROOT=temporary_media.name)
        settings_override.enable()
        self.addCleanup(settings_override.disable)
        self.client.force_login(self.author)
        created = self.client.post(
            "/api/v1/content/asset-packages/",
            {
                "course": self.course.pk,
                "code": "battery-rig",
                "version": 1,
                "name": "Battery training rig",
                "manifest": {
                    "schemaVersion": 1,
                    "curriculumOwner": "Workflow School",
                    "license": "CC-BY-4.0",
                    "qualityTiers": {"low": {"maximumBytes": 5000000}},
                },
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        package_id = created.json()["id"]

        scene = json.dumps(
            {"asset": {"version": "2.0"}, "scenes": [{}], "nodes": [], "meshes": []},
            separators=(",", ":"),
        ).encode("utf-8")
        scene += b" " * ((4 - len(scene) % 4) % 4)
        glb = (
            struct.pack("<4sII", b"glTF", 2, 20 + len(scene))
            + struct.pack("<II", len(scene), 0x4E4F534A)
            + scene
        )
        uploaded = self.client.post(
            f"/api/v1/content/asset-packages/{package_id}/files/",
            {
                "file": SimpleUploadedFile(
                    "battery-rig.glb", glb, content_type="model/gltf-binary"
                ),
                "role": "primary-scene",
                "licenseSpdx": "CC-BY-4.0",
                "sourceAttribution": "Created by Workflow School for its controlled rig.",
            },
        )
        self.assertEqual(uploaded.status_code, 201)
        self.assertEqual(uploaded.json()["files"][0]["metadata"]["gltfVersion"], "2.0")
        self.assertEqual(uploaded.json()["total_byte_size"], len(glb))
        self.assertEqual(
            self.client.post(f"/api/v1/content/asset-packages/{package_id}/publish/").status_code,
            403,
        )

        self.client.force_login(self.admin)
        published = self.client.post(f"/api/v1/content/asset-packages/{package_id}/publish/")
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.json()["status"], AssetPackage.Status.PUBLISHED)


@override_settings(ALLOWED_HOSTS=["testserver"])
class LearningApiTests(TestCase):
    def setUp(self):
        self.instructor = User.objects.create_user(
            "instructor@example.com", password="password-123"
        )
        self.learner = User.objects.create_user("learner@example.com", password="password-123")
        self.other_learner = User.objects.create_user("other@example.com", password="password-123")
        self.school_admin = User.objects.create_user("admin@example.com", password="password-123")
        self.school = School.objects.create(name="Rubavu Test School", code="rubavu-test")
        SchoolMembership.objects.create(
            school=self.school,
            user=self.instructor,
            role=SchoolMembership.Role.INSTRUCTOR,
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=self.learner,
            role=SchoolMembership.Role.LEARNER,
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=self.school_admin,
            role=SchoolMembership.Role.ADMIN,
        )
        course = Course.objects.create(
            school=self.school,
            title="Automotive Electrical Foundations",
            slug="automotive-electrical-test",
            trade="Automobile Technology",
            is_published=True,
        )
        self.competency = Competency.objects.create(
            course=course,
            code="AUTO-01",
            title="Inspect a battery safely",
            mastery_threshold=100,
        )
        self.lesson = Lesson.objects.create(
            course=course,
            title="Battery inspection",
            slug="battery-inspection",
            summary="Inspect and diagnose a vehicle battery.",
            objectives=["Identify hazards", "Measure voltage"],
            safety_notes=["Wear eye protection"],
            status=Lesson.Status.PUBLISHED,
        )
        self.lesson.competencies.add(self.competency)
        self.steps = [
            ProcedureStep.objects.create(
                lesson=self.lesson,
                order=1,
                code="ppe",
                title="Wear eye protection",
                instruction="Put on the safety glasses.",
                action_code="confirm_ppe",
                feedback="Eye protection confirmed.",
                safety_critical=True,
            ),
            ProcedureStep.objects.create(
                lesson=self.lesson,
                order=2,
                code="meter-mode",
                title="Set the meter",
                instruction="Select DC voltage.",
                action_code="set_meter_dc",
                feedback="DC voltage selected.",
            ),
        ]
        for step in self.steps:
            step.competencies.add(self.competency)
            AcceptableAction.objects.create(
                step=step,
                action_code=step.action_code,
                label=step.title,
                is_primary=True,
            )
            StepFeedback.objects.create(
                step=step,
                outcome=StepFeedback.Outcome.CORRECT,
                message=step.feedback,
            )
        StepFeedback.objects.create(
            step=self.steps[0],
            outcome=StepFeedback.Outcome.SAFETY,
            message="Restore the safe sequence.",
        )
        StepHint.objects.create(
            step=self.steps[0],
            code="wear-eye-protection",
            text="Select the safety glasses first.",
            points_penalty=2,
        )
        self.grading_policy = GradingPolicy.objects.create(
            code="standard",
            version=1,
            name="Standard assessment",
            status=GradingPolicy.Status.PUBLISHED,
        )
        self.scenario = SimulationScenario.objects.create(
            lesson=self.lesson,
            version=1,
            title="Battery inspection scenario",
            definition=build_scenario_definition(self.lesson),
            grading_policy=self.grading_policy,
            status=SimulationScenario.Status.PUBLISHED,
        )
        self.assignment = Assignment.objects.create(
            lesson=self.lesson,
            scenario=self.scenario,
            learner=self.learner,
            assigned_by=self.instructor,
        )

    def test_learner_only_sees_their_assignments(self):
        self.client.force_login(self.learner)
        response = self.client.get("/api/v1/assignments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        item = response.json()["results"][0]
        self.assertEqual(item["lesson"]["title"], "Battery inspection")
        self.assertEqual(item["lesson"]["competencies"][0]["code"], "AUTO-01")

        self.client.force_login(self.other_learner)
        response = self.client.get("/api/v1/assignments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)
        hidden = self.client.get(f"/api/v1/assignments/{self.assignment.pk}/")
        self.assertEqual(hidden.status_code, 404)

    def test_start_is_idempotent_for_an_active_attempt(self):
        self.client.force_login(self.learner)
        url = f"/api/v1/assignments/{self.assignment.pk}/start/"
        first = self.client.post(url)
        second = self.client.post(url)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["attempt"]["id"], second.json()["attempt"]["id"])
        self.assertEqual(first.json()["attempt"]["scenario_version"], 1)
        self.assertEqual(first.json()["attempt"]["grading_policy_version"], 1)
        self.assertEqual(Attempt.objects.count(), 1)
        started_event = AttemptEvent.objects.get()
        self.assertEqual(started_event.event_type, "attempt_started")
        self.assertEqual(started_event.payload["scenarioVersion"], 1)

    def test_knowledge_check_renderer_and_event_sync_are_idempotent(self):
        self.client.force_login(self.learner)
        knowledge_url = f"/api/v1/assignments/{self.assignment.pk}/knowledge-check/"
        saved = self.client.post(
            knowledge_url,
            {
                "answers": [
                    {"questionCode": "ppe", "response": True},
                    {"questionCode": "isolation", "response": True},
                    {"questionCode": "meter", "response": False},
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 201)
        self.assertEqual(saved.json()["score"], "66.67")
        self.assertEqual(self.client.get(knowledge_url).json()["answers"][0]["questionCode"], "ppe")

        started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        renderer = self.client.post(
            f"/api/v1/attempts/{attempt_id}/renderer/",
            {
                "mode": "marker_ar",
                "learningMode": "independent",
                "capabilityProfile": {"camera": True, "webgl": True, "online": True},
            },
            content_type="application/json",
        )
        self.assertEqual(renderer.status_code, 200)
        self.assertEqual(renderer.json()["renderer_mode"], "marker_ar")
        self.assertEqual(renderer.json()["learning_mode"], "independent")

        stale = self.client.post(
            f"/api/v1/attempts/{attempt_id}/actions/",
            {
                "action": "confirm_ppe",
                "metadata": {"rendererMode": "marker_ar", "scenarioVersion": 999},
            },
            content_type="application/json",
        )
        self.assertEqual(stale.status_code, 409)
        self.assertIn("stale scenario version", stale.json()["detail"])

        event_id = str(uuid.uuid4())
        batch = {
            "events": [
                {
                    "eventId": event_id,
                    "eventType": "ar_marker_found",
                    "rendererMode": "marker_ar",
                    "occurredAt": timezone.now().isoformat(),
                    "payload": {"detector": "barcode-qr", "latencyMs": 80},
                }
            ]
        }
        event_url = f"/api/v1/attempts/{attempt_id}/events/batch/"
        self.assertEqual(
            self.client.post(event_url, batch, content_type="application/json").status_code,
            200,
        )
        duplicate = self.client.post(event_url, batch, content_type="application/json")
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(AttemptEvent.objects.filter(event_id=event_id).count(), 1)
        reconciliation = self.client.post(
            f"/api/v1/attempts/{attempt_id}/sync-audit/",
            {
                "eventIds": [event_id],
                "pendingCount": 0,
                "clientCreatedAt": timezone.now().isoformat(),
            },
            content_type="application/json",
        )
        self.assertEqual(reconciliation.status_code, 201)
        self.assertTrue(reconciliation.json()["passed"])
        missing_reconciliation = self.client.post(
            f"/api/v1/attempts/{attempt_id}/sync-audit/",
            {
                "eventIds": [str(uuid.uuid4())],
                "pendingCount": 0,
                "clientCreatedAt": timezone.now().isoformat(),
            },
            content_type="application/json",
        )
        self.assertEqual(missing_reconciliation.status_code, 201)
        self.assertFalse(missing_reconciliation.json()["passed"])
        self.assertEqual(len(missing_reconciliation.json()["missing_event_ids"]), 1)
        self.assertEqual(
            self.client.post(
                event_url, {"events": []}, content_type="application/json"
            ).status_code,
            400,
        )
        repeated_id = str(uuid.uuid4())
        repeated_batch = {
            "events": [
                {
                    "eventId": repeated_id,
                    "eventType": "sync_state_changed",
                    "rendererMode": "marker_ar",
                    "occurredAt": timezone.now().isoformat(),
                    "payload": {},
                },
                {
                    "eventId": repeated_id,
                    "eventType": "sync_state_changed",
                    "rendererMode": "marker_ar",
                    "occurredAt": timezone.now().isoformat(),
                    "payload": {},
                },
            ]
        }
        self.assertEqual(
            self.client.post(
                event_url, repeated_batch, content_type="application/json"
            ).status_code,
            400,
        )
        later = timezone.now()
        earlier = later - timedelta(minutes=2)
        delayed = self.client.post(
            event_url,
            {
                "events": [
                    {
                        "eventId": str(uuid.uuid4()),
                        "eventType": "sync_state_changed",
                        "rendererMode": "marker_ar",
                        "occurredAt": later.isoformat(),
                        "payload": {"state": "later-created"},
                    },
                    {
                        "eventId": str(uuid.uuid4()),
                        "eventType": "sync_state_changed",
                        "rendererMode": "marker_ar",
                        "occurredAt": earlier.isoformat(),
                        "payload": {"state": "delayed-arrival"},
                    },
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(delayed.status_code, 200)
        self.assertEqual(delayed.json()[1]["payload"]["state"], "delayed-arrival")

        action_id = str(uuid.uuid4())
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"
        first = self.client.post(
            action_url,
            {
                "action": "confirm_ppe",
                "eventId": action_id,
                "metadata": {"rendererMode": "marker_ar"},
            },
            content_type="application/json",
        )
        replay = self.client.post(
            action_url,
            {
                "action": "confirm_ppe",
                "eventId": action_id,
                "metadata": {"rendererMode": "marker_ar"},
            },
            content_type="application/json",
        )
        self.assertTrue(first.json()["correct"])
        self.assertTrue(replay.json()["correct"])
        self.assertEqual(AttemptEvent.objects.filter(event_id=action_id).count(), 1)
        conflict = self.client.post(
            action_url,
            {
                "action": "set_meter_dc",
                "eventId": action_id,
                "metadata": {"rendererMode": "marker_ar"},
            },
            content_type="application/json",
        )
        self.assertEqual(conflict.status_code, 409)

    def test_safe_restart_preserves_abandoned_attempt_evidence(self):
        self.client.force_login(self.learner)
        first = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/").json()[
            "attempt"
        ]
        self.client.post(
            f"/api/v1/attempts/{first['id']}/actions/",
            {"action": "confirm_ppe"},
            content_type="application/json",
        )
        ended = self.client.post(f"/api/v1/attempts/{first['id']}/abandon/")
        self.assertEqual(ended.status_code, 200)
        self.assertEqual(ended.json()["attempt"]["status"], Attempt.Status.ABANDONED)
        self.assertEqual(
            AttemptEvent.objects.filter(
                attempt_id=first["id"], event_type="step_completed"
            ).count(),
            1,
        )
        self.assertTrue(
            AttemptEvent.objects.filter(
                attempt_id=first["id"], event_type="attempt_abandoned"
            ).exists()
        )
        restarted = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/").json()[
            "attempt"
        ]
        self.assertNotEqual(restarted["id"], first["id"])
        self.assertEqual(restarted["resume_state"], {"completedSteps": [], "currentStep": "ppe"})

    def test_equivalent_renderer_actions_produce_identical_grading_evidence(self):
        self.assignment.attempt_limit = 4
        self.assignment.save(update_fields=["attempt_limit"])
        self.client.force_login(self.learner)
        outcomes = []
        for renderer_mode in [
            Attempt.RendererMode.ACCESSIBLE_2D,
            Attempt.RendererMode.DESKTOP_3D,
            Attempt.RendererMode.MARKER_AR,
            Attempt.RendererMode.MARKERLESS_AR,
        ]:
            started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
            attempt_id = started.json()["attempt"]["id"]
            self.client.post(
                f"/api/v1/attempts/{attempt_id}/renderer/",
                {"mode": renderer_mode, "capabilityProfile": {"testProfile": True}},
                content_type="application/json",
            )
            for action_code in ["confirm_ppe", "set_meter_dc"]:
                action = self.client.post(
                    f"/api/v1/attempts/{attempt_id}/actions/",
                    {
                        "action": action_code,
                        "metadata": {"rendererMode": renderer_mode},
                    },
                    content_type="application/json",
                )
                self.assertTrue(action.json()["correct"])
            result = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/").json()["attempt"]
            recommendation = self.client.get(
                f"/api/v1/attempts/{attempt_id}/recommendation/"
            ).json()
            outcomes.append(
                (
                    result["score"],
                    result["outcome"],
                    [item["outcome"] for item in result["step_results"]],
                    [item["mastery_state"] for item in result["competency_results"]],
                    recommendation["kind"],
                    recommendation["input_snapshot"],
                )
            )
        self.assertEqual(len(set(map(str, outcomes))), 1)

    def test_xapi_export_and_transparent_recommendation_use_authoritative_events(self):
        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"
        for action_code in ["confirm_ppe", "set_meter_dc"]:
            self.client.post(action_url, {"action": action_code}, content_type="application/json")
        completed = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(completed.status_code, 200)

        recommendation = self.client.get(f"/api/v1/attempts/{attempt_id}/recommendation/")
        self.assertEqual(recommendation.status_code, 200)
        self.assertEqual(recommendation.json()["kind"], "complete")
        self.assertEqual(recommendation.json()["rule_version"], "transparent-rules-v1")

        self.client.force_login(self.instructor)
        overridden = self.client.patch(
            f"/api/v1/instructor/attempts/{attempt_id}/",
            {"kind": "continue", "reason": "Physical transfer still needs observation."},
            content_type="application/json",
        )
        self.assertEqual(overridden.status_code, 200)
        self.assertEqual(overridden.json()["override_kind"], "continue")
        self.assertTrue(
            AuditEvent.objects.filter(event_type="assessment.recommendation_overridden").exists()
        )

        self.client.force_login(self.learner)
        recommendation = self.client.get(f"/api/v1/attempts/{attempt_id}/recommendation/")
        self.assertEqual(recommendation.json()["override_kind"], "continue")

        exported = self.client.get(f"/api/v1/attempts/{attempt_id}/xapi/")
        self.assertEqual(exported.status_code, 200)
        statements = exported.json()["statements"]
        self.assertTrue(exported.json()["conformance"]["valid"])
        self.assertEqual(
            len(statements), AttemptEvent.objects.filter(attempt_id=attempt_id).count()
        )
        self.assertEqual(len({statement["id"] for statement in statements}), len(statements))
        self.assertTrue(all("mbox_sha1sum" in statement["actor"] for statement in statements))
        self.assertTrue(all("mbox" not in statement["actor"] for statement in statements))
        self.assertTrue(all(statement["version"] == "1.0.3" for statement in statements))
        self.assertEqual(
            XApiDelivery.objects.filter(attempt_id=attempt_id).count(), len(statements)
        )

    def test_instructor_can_publish_feedback_visible_to_the_learner(self):
        attempt = Attempt.objects.create(
            assignment=self.assignment,
            learner=self.learner,
            scenario=self.scenario,
            grading_policy=self.grading_policy,
        )
        url = f"/api/v1/instructor/attempts/{attempt.pk}/"
        self.client.force_login(self.instructor)
        published = self.client.post(
            url,
            {
                "observation": "Safe equipment preparation observed.",
                "feedback": "Repeat the meter setup without prompts.",
                "is_published": True,
            },
            content_type="application/json",
        )
        self.assertEqual(published.status_code, 201)
        self.assertIsNotNone(published.json()["published_at"])

        self.client.force_login(self.learner)
        detail = self.client.get(f"/api/v1/attempts/{attempt.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(
            detail.json()["feedback"][0]["feedback"], "Repeat the meter setup without prompts."
        )

    @override_settings(RESEARCH_CONSENT_STATUS="approved")
    def test_research_responses_are_pseudonymized_and_school_scoped(self):
        self.client.force_login(self.learner)
        submitted = self.client.post(
            "/api/v1/research/surveys/",
            {
                "instrument": "sus",
                "responses": {"item_1": 4, "item_2": 2},
                "consent_version": "opedu-pilot-consent-v1",
                "consent_accepted": True,
                "scenario_version": "battery-v1",
            },
            content_type="application/json",
        )
        self.assertEqual(submitted.status_code, 201)
        participant_code = submitted.json()["participant_code"]
        self.assertEqual(len(participant_code), 24)
        self.assertNotIn(self.learner.username, participant_code)
        receipt = ResearchConsentReceipt.objects.get(participant_code=participant_code)
        self.assertEqual(receipt.status, ResearchConsentReceipt.Status.ACTIVE)
        self.assertTrue(AuditEvent.objects.filter(event_type="research.consent_recorded").exists())

        self.client.force_login(self.instructor)
        listed = self.client.get("/api/v1/research/surveys/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["participant_code"], participant_code)

        self.client.force_login(self.learner)
        self.assertEqual(self.client.get("/api/v1/research/surveys/").status_code, 403)
        withdrawn = self.client.delete("/api/v1/research/surveys/")
        self.assertEqual(withdrawn.status_code, 204)
        self.assertFalse(ResearchSurveyResponse.objects.exists())
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, ResearchConsentReceipt.Status.WITHDRAWN)
        self.assertIsNotNone(receipt.withdrawn_at)
        self.assertTrue(
            AuditEvent.objects.filter(event_type="research.responses_withdrawn").exists()
        )

    @override_settings(RESEARCH_CONSENT_STATUS="approved")
    def test_research_submission_requires_explicit_current_consent(self):
        self.client.force_login(self.learner)
        payload = {
            "instrument": "sus",
            "responses": {"item_1": 4},
            "consent_version": "opedu-pilot-consent-v1",
            "scenario_version": "battery-v1",
        }
        missing = self.client.post(
            "/api/v1/research/surveys/", payload, content_type="application/json"
        )
        self.assertEqual(missing.status_code, 400)
        stale = self.client.post(
            "/api/v1/research/surveys/",
            {**payload, "consent_accepted": True, "consent_version": "retired-consent"},
            content_type="application/json",
        )
        self.assertEqual(stale.status_code, 400)
        self.assertFalse(ResearchSurveyResponse.objects.exists())
        self.assertFalse(ResearchConsentReceipt.objects.exists())

    def test_research_collection_is_disabled_while_policy_is_draft(self):
        self.client.force_login(self.learner)
        policy = self.client.get("/api/v1/research/consent-policy/")
        self.assertEqual(policy.status_code, 200)
        self.assertEqual(policy.json()["status"], "draft")
        self.assertEqual(policy.json()["version"], "opedu-pilot-consent-v1")
        response = self.client.post(
            "/api/v1/research/surveys/",
            {
                "instrument": "sus",
                "responses": {"item_1": 4},
                "consent_version": "opedu-pilot-consent-v1",
                "consent_accepted": True,
                "scenario_version": "battery-v1",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertFalse(ResearchSurveyResponse.objects.exists())

    def test_expired_research_responses_are_purged_but_receipt_is_retained(self):
        participant_code = "expired-participant"
        consented_at = timezone.now() - timedelta(days=2)
        receipt = ResearchConsentReceipt.objects.create(
            school=self.school,
            participant_code=participant_code,
            consent_version="opedu-pilot-consent-v1",
            scenario_version="battery-v1",
            consented_at=consented_at,
            expires_at=consented_at + timedelta(days=1),
        )
        ResearchSurveyResponse.objects.create(
            school=self.school,
            participant_code=participant_code,
            instrument=ResearchSurveyResponse.Instrument.SUS,
            responses={"item_1": 3},
            consent_version=receipt.consent_version,
            scenario_version=receipt.scenario_version,
        )

        call_command("purge_expired_research", stdout=StringIO())

        self.assertFalse(ResearchSurveyResponse.objects.exists())
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, ResearchConsentReceipt.Status.EXPIRED)
        self.assertTrue(AuditEvent.objects.filter(event_type="research.responses_expired").exists())

    def test_instructor_assignment_creation_is_school_scoped_and_idempotent(self):
        second_learner = User.objects.create_user(
            "second-learner@example.com", password="password-123"
        )
        SchoolMembership.objects.create(
            school=self.school,
            user=second_learner,
            role=SchoolMembership.Role.LEARNER,
        )
        program = Program.objects.create(
            school=self.school,
            code="cohort-program",
            name="Cohort program",
        )
        cohort = Cohort.objects.create(
            school=self.school,
            program=program,
            code="cohort-a",
            name="Cohort A",
        )
        Enrollment.objects.create(cohort=cohort, learner=second_learner)
        self.client.force_login(self.instructor)
        options = self.client.get("/api/v1/instructor/assignments/")
        self.assertEqual(options.status_code, 200)
        self.assertIn(second_learner.pk, [item["id"] for item in options.json()["learners"]])
        self.assertEqual(options.json()["cohorts"][0]["learnerCount"], 1)
        created = self.client.post(
            "/api/v1/instructor/assignments/",
            {
                "scenarioId": self.scenario.pk,
                "learnerIds": [self.learner.pk, second_learner.pk],
                "cohortIds": [cohort.pk],
                "attemptLimit": 3,
                "instructions": "Complete the approved safety procedure.",
            },
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["created"], 1)
        self.assertEqual(created.json()["existing"], 1)
        self.assertEqual(Assignment.objects.filter(scenario=self.scenario).count(), 2)

        outsider = User.objects.create_user("outsider@example.com", password="password-123")
        rejected = self.client.post(
            "/api/v1/instructor/assignments/",
            {"scenarioId": self.scenario.pk, "learnerIds": [outsider.pk]},
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 403)

    def test_attempt_enforces_order_resumes_and_scores_on_the_server(self):
        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"

        early = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(early.status_code, 400)

        self.steps[0].action_code = "changed_after_attempt_started"
        self.steps[0].feedback = "Changed live feedback."
        self.steps[0].save()

        wrong = self.client.post(
            action_url,
            {"action": "set_meter_dc"},
            content_type="application/json",
        )
        self.assertEqual(wrong.status_code, 200)
        self.assertFalse(wrong.json()["correct"])
        self.assertEqual(wrong.json()["currentStep"]["code"], "ppe")

        first = self.client.post(
            action_url,
            {"action": "confirm_ppe", "metadata": {"source": "accessible-controls"}},
            content_type="application/json",
        )
        self.assertTrue(first.json()["correct"])
        self.assertEqual(first.json()["message"], "Eye protection confirmed.")
        self.assertEqual(first.json()["currentStep"]["code"], "meter-mode")
        self.assertEqual(first.json()["attempt"]["resume_state"]["completedSteps"], ["ppe"])

        second = self.client.post(
            action_url,
            {"action": "set_meter_dc"},
            content_type="application/json",
        )
        self.assertTrue(second.json()["isReadyToComplete"])

        completed = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["attempt"]["status"], "completed")
        self.assertEqual(completed.json()["attempt"]["outcome"], "passed")
        self.assertEqual(completed.json()["attempt"]["score"], "85.00")
        self.assertEqual(len(completed.json()["attempt"]["step_results"]), 2)
        competency_result = completed.json()["attempt"]["competency_results"][0]
        self.assertEqual(competency_result["mastery_percentage"], "50.00")
        self.assertEqual(competency_result["mastery_state"], "developing")
        step_result = StepResult.objects.get(attempt_id=attempt_id, step_code="ppe")
        step_result.hints_used = 99
        with self.assertRaisesMessage(ValidationError, "immutable"):
            step_result.save()
        self.assertEqual(
            list(AttemptEvent.objects.values_list("event_type", flat=True)),
            [
                "attempt_started",
                "incorrect_action",
                "step_completed",
                "step_completed",
                "attempt_completed",
            ],
        )

    def test_new_scenario_uses_its_own_grading_policy_without_changing_old_attempts(self):
        policy_v2 = GradingPolicy.objects.create(
            code="standard",
            version=2,
            name="Safety review policy",
            safety_critical_penalty=40,
            requires_review_on_safety_error=True,
            status=GradingPolicy.Status.PUBLISHED,
        )
        scenario_v2 = SimulationScenario.objects.create(
            lesson=self.assignment.lesson,
            version=2,
            title="Battery inspection scenario v2",
            definition=self.scenario.definition,
            grading_policy=policy_v2,
            status=SimulationScenario.Status.PUBLISHED,
        )
        assignment_v2 = Assignment.objects.create(
            lesson=self.assignment.lesson,
            scenario=scenario_v2,
            learner=self.learner,
            assigned_by=self.instructor,
        )

        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{assignment_v2.pk}/start/")
        self.assertEqual(started.status_code, 201)
        attempt_id = started.json()["attempt"]["id"]
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"
        self.client.post(
            action_url,
            {"action": "set_meter_dc"},
            content_type="application/json",
        )
        for action_code in ["confirm_ppe", "set_meter_dc"]:
            self.client.post(
                action_url,
                {"action": action_code},
                content_type="application/json",
            )
        completed = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["attempt"]["score"], "60.00")
        self.assertEqual(completed.json()["attempt"]["status"], "requires_review")
        self.assertEqual(completed.json()["attempt"]["outcome"], "requires_review")
        self.assertEqual(completed.json()["attempt"]["grading_policy_version"], 2)

    def test_hint_usage_is_recorded_and_penalized_in_results(self):
        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        hint_url = f"/api/v1/attempts/{attempt_id}/hints/"
        hint = self.client.post(hint_url, {}, content_type="application/json")
        self.assertEqual(hint.status_code, 200)
        self.assertEqual(hint.json()["hint"]["code"], "wear-eye-protection")
        self.assertEqual(
            self.client.post(hint_url, {}, content_type="application/json").status_code,
            409,
        )
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"
        for action_code in ["confirm_ppe", "set_meter_dc"]:
            self.client.post(
                action_url,
                {"action": action_code},
                content_type="application/json",
            )
        completed = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(completed.json()["attempt"]["score"], "98.00")
        result = next(
            item
            for item in completed.json()["attempt"]["step_results"]
            if item["step_code"] == "ppe"
        )
        self.assertEqual(result["hints_used"], 1)
        self.assertEqual(result["attempts_count"], 1)
        self.assertEqual(result["achieved_points"], "8.00")

    def test_tolerance_evidence_rejects_then_accepts_a_measurement(self):
        tolerance = StepTolerance.objects.create(
            step=self.steps[1],
            code="meter-reading",
            measurement="Meter reading",
            minimum_value="12.4000",
            maximum_value="12.8000",
            unit="V",
        )
        action = AcceptableAction.objects.get(step=self.steps[1])
        action.tolerance = tolerance
        action.save()
        StepFeedback.objects.create(
            step=self.steps[1],
            outcome=StepFeedback.Outcome.TOLERANCE,
            message="Use a value from 12.4 V through 12.8 V.",
        )
        scenario = SimulationScenario.objects.create(
            lesson=self.lesson,
            version=3,
            title="Tolerance scenario",
            definition=build_scenario_definition(self.lesson),
            grading_policy=self.grading_policy,
            status=SimulationScenario.Status.PUBLISHED,
        )
        assignment = Assignment.objects.create(
            lesson=self.lesson,
            scenario=scenario,
            learner=self.learner,
            assigned_by=self.instructor,
        )
        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"
        self.client.post(
            action_url,
            {"action": "confirm_ppe"},
            content_type="application/json",
        )
        outside = self.client.post(
            action_url,
            {"action": "set_meter_dc", "metadata": {"measurement": 13.2}},
            content_type="application/json",
        )
        self.assertFalse(outside.json()["correct"])
        self.assertEqual(outside.json()["message"], "Use a value from 12.4 V through 12.8 V.")
        accepted = self.client.post(
            action_url,
            {"action": "set_meter_dc", "metadata": {"measurement": 12.6}},
            content_type="application/json",
        )
        self.assertTrue(accepted.json()["correct"])
        completed = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        result = next(
            item
            for item in completed.json()["attempt"]["step_results"]
            if item["step_code"] == "meter-mode"
        )
        self.assertFalse(result["tolerance_passed"])
        self.assertEqual(result["attempts_count"], 2)
        self.assertEqual(
            list(
                AttemptEvent.objects.filter(attempt_id=attempt_id).values_list(
                    "event_type", flat=True
                )
            ),
            [
                "attempt_started",
                "step_completed",
                "tolerance_failed",
                "step_completed",
                "attempt_completed",
            ],
        )

    def test_attempts_are_private_to_their_learner(self):
        attempt = Attempt.objects.create(
            assignment=self.assignment,
            learner=self.learner,
            scenario=self.scenario,
            grading_policy=self.grading_policy,
        )
        self.client.force_login(self.other_learner)
        self.assertEqual(self.client.get(f"/api/v1/attempts/{attempt.pk}/").status_code, 404)
        self.assertEqual(
            self.client.post(
                f"/api/v1/attempts/{attempt.pk}/actions/",
                {"action": "confirm_ppe"},
                content_type="application/json",
            ).status_code,
            404,
        )

    def test_instructor_overview_reports_school_scoped_evidence(self):
        attempt = Attempt.objects.create(
            assignment=self.assignment,
            learner=self.learner,
            scenario=self.scenario,
            grading_policy=self.grading_policy,
            resume_state={"completedSteps": ["ppe"], "currentStep": "meter-mode"},
        )
        AttemptEvent.objects.create(
            attempt=attempt,
            sequence=1,
            event_type="attempt_started",
        )
        AttemptEvent.objects.create(
            attempt=attempt,
            sequence=2,
            event_type="incorrect_action",
            payload={"action": "set_meter_dc", "safetyCritical": True},
        )
        AttemptEvent.objects.create(
            attempt=attempt,
            sequence=3,
            event_type="step_completed",
            payload={"stepCode": "ppe", "action": "confirm_ppe"},
        )

        self.client.force_login(self.instructor)
        overview = self.client.get("/api/v1/instructor/overview/")
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(
            overview.json()["metrics"],
            {
                "learners": 1,
                "assignments": 1,
                "attempts": 1,
                "completedAttempts": 0,
                "inProgressAttempts": 1,
                "safetyErrors": 1,
                "overdueAttempts": 0,
                "requiresReview": 0,
                "failedAttempts": 0,
            },
        )
        evidence = overview.json()["attempts"][0]
        self.assertEqual(evidence["learner"]["email"], self.learner.email)
        self.assertEqual(evidence["completed_steps"], 1)
        self.assertEqual(evidence["incorrect_actions"], 1)

        review = self.client.get(f"/api/v1/instructor/attempts/{attempt.pk}/")
        self.assertEqual(review.status_code, 200)
        self.assertEqual(len(review.json()["events"]), 3)
        self.assertEqual(review.json()["procedure_steps"][0]["code"], "ppe")

    def test_instructor_evidence_rejects_learners_and_other_schools(self):
        attempt = Attempt.objects.create(
            assignment=self.assignment,
            learner=self.learner,
            scenario=self.scenario,
            grading_policy=self.grading_policy,
        )

        self.client.force_login(self.learner)
        self.assertEqual(self.client.get("/api/v1/instructor/overview/").status_code, 403)

        other_instructor = User.objects.create_user(
            "elsewhere@example.com", password="password-123"
        )
        other_school = School.objects.create(name="Other School", code="other-school")
        SchoolMembership.objects.create(
            school=other_school,
            user=other_instructor,
            role=SchoolMembership.Role.INSTRUCTOR,
        )
        self.client.force_login(other_instructor)
        overview = self.client.get("/api/v1/instructor/overview/")
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.json()["metrics"]["attempts"], 0)
        self.assertEqual(
            self.client.get(f"/api/v1/instructor/attempts/{attempt.pk}/").status_code,
            404,
        )

    def test_instructor_csv_export_is_scoped_and_research_export_is_pseudonymized(self):
        Attempt.objects.create(
            assignment=self.assignment,
            learner=self.learner,
            scenario=self.scenario,
            grading_policy=self.grading_policy,
        )
        self.client.force_login(self.instructor)
        operational = self.client.get("/api/v1/instructor/evidence.csv")
        self.assertEqual(operational.status_code, 200)
        self.assertEqual(operational["Cache-Control"], "private, no-store")
        self.assertIn("learner@example.com", operational.content.decode())

        research = self.client.get("/api/v1/instructor/evidence.csv?scope=research")
        self.assertEqual(research.status_code, 200)
        self.assertNotIn("learner@example.com", research.content.decode())
        self.assertIn("battery inspection", research.content.decode().lower())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_school_admin_can_invite_and_new_user_can_accept_once(self):
        self.client.force_login(self.school_admin)
        created = self.client.post(
            "/api/v1/school/invitations/",
            {"email": "new-learner@example.com", "role": SchoolMembership.Role.LEARNER},
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        token = created.json()["acceptUrl"].rsplit("/", 1)[-1]
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn(token, str(SchoolInvitation.objects.get().token_hash))

        self.client.logout()
        preview = self.client.get(f"/api/v1/school/invitations/accept/{token}/")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["schoolName"], self.school.name)
        accepted = self.client.post(
            f"/api/v1/school/invitations/accept/{token}/",
            {
                "firstName": "New",
                "lastName": "Learner",
                "password": "A-strong-invited-password-123",
            },
            content_type="application/json",
        )
        self.assertEqual(accepted.status_code, 200)
        invited_user = User.objects.get(email="new-learner@example.com")
        self.assertTrue(
            SchoolMembership.objects.filter(
                school=self.school,
                user=invited_user,
                role=SchoolMembership.Role.LEARNER,
            ).exists()
        )
        self.assertTrue(LearnerProfile.objects.filter(user=invited_user).exists())
        self.assertEqual(
            self.client.post(
                f"/api/v1/school/invitations/accept/{token}/",
                {"firstName": "Again", "lastName": "Again", "password": "Another-pass-123"},
                content_type="application/json",
            ).status_code,
            404,
        )
        self.assertTrue(
            AuditEvent.objects.filter(event_type="membership.invitation_accepted").exists()
        )

    def test_school_admin_activation_is_scoped_and_protects_last_admin(self):
        membership = SchoolMembership.objects.get(school=self.school, user=self.learner)
        self.client.force_login(self.school_admin)
        deactivated = self.client.patch(
            f"/api/v1/school/members/{membership.pk}/",
            {"isActive": False},
            content_type="application/json",
        )
        self.assertEqual(deactivated.status_code, 200)
        membership.refresh_from_db()
        self.learner.refresh_from_db()
        self.assertFalse(membership.is_active)
        self.assertFalse(self.learner.is_active)

        own_membership = SchoolMembership.objects.get(school=self.school, user=self.school_admin)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/school/members/{own_membership.pk}/",
                {"isActive": False},
                content_type="application/json",
            ).status_code,
            409,
        )

        self.client.force_login(self.instructor)
        self.assertEqual(self.client.get("/api/v1/school/members/").status_code, 403)


@override_settings(ALLOWED_HOSTS=["testserver"], RESEARCH_CONSENT_STATUS="approved")
class PilotWorkflowTests(TestCase):
    def setUp(self):
        call_command("seed_demo", stdout=StringIO())
        self.school = School.objects.get(code="rubavu-demo-tss")
        self.admin = User.objects.get(username="admin@opedu.local")
        self.instructor = User.objects.get(username="instructor@opedu.local")
        self.learner = User.objects.get(username="learner@opedu.local")
        self.scenario = SimulationScenario.objects.get(
            lesson__slug="battery-inspection-and-diagnosis",
            status=SimulationScenario.Status.PUBLISHED,
        )
        self.cohort = Cohort.objects.get(school=self.school)
        self.payload = {
            "school": self.school.pk,
            "code": "battery-pilot-2026",
            "title": "Battery WebAR controlled pilot",
            "scenario": self.scenario.pk,
            "cohort": self.cohort.pk,
            "protocol_version": "battery-pilot-v1",
            "consent_version": "opedu-pilot-consent-v1",
            "instruments": {
                instrument: {
                    "version": "v1",
                    "evidenceReference": f"controlled://instruments/{instrument}/v1",
                    "contentSha256": hashlib.sha256(instrument.encode()).hexdigest(),
                }
                for instrument in PilotObservation.Instrument.values
            },
            "supported_devices": [
                {
                    "model": "Approved Android",
                    "os": "Android 15",
                    "browser": "Chrome 140",
                    "tier": "lowest-supported",
                    "supported": True,
                },
                {
                    "model": "Fallback profile",
                    "os": "Android 10",
                    "browser": "Legacy browser",
                    "tier": "unsupported",
                    "supported": False,
                },
            ],
            "analysis_plan": {
                "primaryOutcome": "paired_pre_post_change",
                "missingDataPolicy": "report_all_missing_by_instrument",
                "exclusionPolicy": "exclude_only_predeclared_invalid_records",
                "uncertaintyMethod": "paired_t_95_ci",
            },
            "thresholds": {
                "susMedianMin": 70,
                "recognitionSuccessRateMin": 0.9,
                "recognitionMedianLatencyMsMax": 1000,
                "completionRateGapMax": 0.1,
                "meanScoreGapMax": 10,
                "instructorWorkloadMinutesMax": 120,
            },
        }

    def create_study(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/research/pilots/",
            self.payload,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return PilotStudy.objects.get(pk=response.json()["id"])

    def freeze_and_start(self, study):
        self.client.force_login(self.admin)
        transition_url = f"/api/v1/research/pilots/{study.pk}/transition/"
        frozen = self.client.post(
            transition_url,
            {"action": "freeze"},
            content_type="application/json",
        )
        self.assertEqual(frozen.status_code, 200, frozen.content)
        decided_at = timezone.now().isoformat()
        for domain in [
            PilotApproval.Domain.ETHICS,
            PilotApproval.Domain.PRIVACY,
            PilotApproval.Domain.SAFEGUARDING,
            PilotApproval.Domain.INSTRUCTOR,
            PilotApproval.Domain.SAFETY,
            PilotApproval.Domain.DEVICE,
        ]:
            response = self.client.post(
                f"/api/v1/research/pilots/{study.pk}/approvals/",
                {
                    "domain": domain,
                    "status": "approved",
                    "approver_name": f"Approved {domain}",
                    "approver_role": f"{domain} owner",
                    "organization": "Rubavu Demo TSS",
                    "evidence_reference": f"controlled://approvals/{domain}/v1",
                    "scope": "Battery pilot v1 only.",
                    "decision_at": decided_at,
                },
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 201, response.content)
        for kind in PilotRehearsal.Kind.values:
            response = self.client.post(
                f"/api/v1/research/pilots/{study.pk}/rehearsals/",
                {
                    "kind": kind,
                    "outcome": "pass",
                    "facilitator": "Qualified pilot facilitator",
                    "participant_count": 2,
                    "evidence_reference": f"controlled://rehearsals/{kind}/v1",
                    "notes": "No personal data recorded.",
                    "completed_at": decided_at,
                },
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 201, response.content)
        started = self.client.post(
            transition_url,
            {"action": "start"},
            content_type="application/json",
        )
        self.assertEqual(started.status_code, 200, started.content)
        study.refresh_from_db()
        self.assertEqual(study.status, PilotStudy.Status.COLLECTING)

    def test_protocol_freeze_is_complete_immutable_and_audited(self):
        study = self.create_study()
        self.client.force_login(self.instructor)
        forbidden = self.client.patch(
            f"/api/v1/research/pilots/{study.pk}/",
            {"title": "Instructor rewrite"},
            content_type="application/json",
        )
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_login(self.admin)
        frozen = self.client.post(
            f"/api/v1/research/pilots/{study.pk}/transition/",
            {"action": "freeze"},
            content_type="application/json",
        )
        self.assertEqual(frozen.status_code, 200, frozen.content)
        self.assertEqual(frozen.json()["status"], "frozen")
        self.assertEqual(
            frozen.json()["protocol_snapshot"]["scenario"]["version"],
            self.scenario.version,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/research/pilots/{study.pk}/",
                {"title": "Rewrite after freeze"},
                content_type="application/json",
            ).status_code,
            409,
        )
        study.refresh_from_db()
        study.title = "Direct frozen rewrite"
        with self.assertRaisesMessage(ValidationError, "immutable"):
            study.save()
        self.assertTrue(AuditEvent.objects.filter(event_type="pilot.study_frozen").exists())

    def test_collection_enforces_consent_validates_instruments_and_reports_missing_data(self):
        study = self.create_study()
        self.freeze_and_start(study)
        observations_url = f"/api/v1/research/pilots/{study.pk}/observations/"

        self.client.force_login(self.learner)
        invalid = self.client.post(
            observations_url,
            {
                "instrument": "sus",
                "responses": {"items": [5] * 9},
                "consent_accepted": True,
            },
            content_type="application/json",
        )
        self.assertEqual(invalid.status_code, 400)
        submitted = self.client.post(
            observations_url,
            {
                "instrument": "sus",
                "responses": {"items": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]},
                "consent_accepted": True,
            },
            content_type="application/json",
        )
        self.assertEqual(submitted.status_code, 201, submitted.content)
        code = research_participant_code(self.school.pk, self.learner.pk)
        self.assertEqual(submitted.json()["participant_code"], code)
        duplicate = self.client.post(
            observations_url,
            {
                "instrument": "sus",
                "responses": {"items": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]},
                "consent_accepted": True,
            },
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 409)

        self.client.force_login(self.instructor)
        for instrument, responses in [
            ("pre_test", {"score": 40}),
            ("post_test", {"score": 80}),
            (
                "transfer",
                {
                    "sequence": 4,
                    "accuracy": 4,
                    "safety": 4,
                    "time": 3,
                    "independence": 4,
                    "criticalSafetyFailure": False,
                    "durationSeconds": 360,
                },
            ),
        ]:
            response = self.client.post(
                observations_url,
                {
                    "instrument": instrument,
                    "responses": responses,
                    "learner_id": self.learner.pk,
                },
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 201, response.content)

        report = self.client.get(f"/api/v1/research/pilots/{study.pk}/report/")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.json()["learning"]["pairedN"], 1)
        self.assertEqual(report.json()["learning"]["meanChange"], 40)
        self.assertEqual(report.json()["acceptance"]["susMedian"], 100)
        self.assertEqual(report.json()["missingByInstrument"]["tam"], 1)
        self.assertEqual(report.json()["overallGate"], "insufficient")

        self.client.force_login(self.learner)
        self.assertEqual(self.client.delete("/api/v1/research/surveys/").status_code, 204)
        self.assertFalse(PilotObservation.objects.filter(participant_code=code).exists())

    def test_independent_review_cannot_approve_expansion_without_passing_evidence(self):
        study = self.create_study()
        self.freeze_and_start(study)
        self.client.force_login(self.admin)
        transition_url = f"/api/v1/research/pilots/{study.pk}/transition/"
        self.assertEqual(
            self.client.post(
                transition_url,
                {"action": "close"},
                content_type="application/json",
            ).status_code,
            200,
        )
        review_url = f"/api/v1/research/pilots/{study.pk}/review/"
        review = {
            "decision": "expand",
            "reviewer_name": "Independent Reviewer",
            "reviewer_role": "External evaluation chair",
            "organization": "Independent Review Board",
            "evidence_reference": "controlled://reviews/battery-pilot-v1",
            "rationale": "Evidence was independently assessed against the frozen protocol.",
            "limitations": "Single-school evidence; broader effectiveness is not established.",
            "independent_confirmed": True,
            "decided_at": timezone.now().isoformat(),
        }
        self.assertEqual(
            self.client.post(review_url, review, content_type="application/json").status_code,
            409,
        )
        review["decision"] = "limit"
        accepted = self.client.post(review_url, review, content_type="application/json")
        self.assertEqual(accepted.status_code, 201, accepted.content)
        self.assertEqual(PilotReview.objects.get(study=study).decision, "limit")
        study.refresh_from_db()
        self.assertEqual(study.status, PilotStudy.Status.REVIEWED)

    def test_pilot_analysis_calculates_paired_uncertainty_and_instrument_reliability(self):
        second = User.objects.create_user("pilot-second@example.com", password="test-pass-123")
        SchoolMembership.objects.create(
            school=self.school,
            user=second,
            role=SchoolMembership.Role.LEARNER,
        )
        Enrollment.objects.create(cohort=self.cohort, learner=second)
        study = self.create_study()
        self.freeze_and_start(study)
        observations = [
            (self.learner, "pre_test", {"score": 40}),
            (self.learner, "post_test", {"score": 80}),
            (self.learner, "sus", {"items": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]}),
            (second, "pre_test", {"score": 50}),
            (second, "post_test", {"score": 70}),
            (second, "sus", {"items": [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]}),
        ]
        for learner, instrument, responses in observations:
            PilotObservation.objects.create(
                study=study,
                participant_code=research_participant_code(self.school.pk, learner.pk),
                instrument=instrument,
                responses=responses,
                consent_version=study.consent_version,
                recorded_by=self.instructor,
            )
        self.client.force_login(self.instructor)
        report = self.client.get(f"/api/v1/research/pilots/{study.pk}/report/").json()
        self.assertEqual(report["learning"]["pairedN"], 2)
        self.assertIsNotNone(report["learning"]["cohensDz"])
        self.assertEqual(len(report["learning"]["meanChange95Ci"]), 2)
        self.assertIsNotNone(report["acceptance"]["susAlpha"])
