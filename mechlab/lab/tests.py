from io import StringIO
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .models import (
    Assignment,
    Attempt,
    AttemptEvent,
    AuditEvent,
    Cohort,
    Competency,
    Course,
    Enrollment,
    InstructorProfile,
    LearnerProfile,
    Lesson,
    Module,
    ProcedureStep,
    Program,
    School,
    SchoolInvitation,
    SchoolMembership,
)
from .permissions import (
    IsContentAuthorOrSchoolAdmin,
    IsInstructorOrSchoolAdmin,
    IsLearner,
    IsPlatformAdministrator,
    IsSchoolAdmin,
    has_active_school_role,
)


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
        competency = Competency.objects.create(
            course=course,
            code="AUTO-01",
            title="Inspect a battery safely",
            mastery_threshold=100,
        )
        lesson = Lesson.objects.create(
            course=course,
            title="Battery inspection",
            slug="battery-inspection",
            summary="Inspect and diagnose a vehicle battery.",
            objectives=["Identify hazards", "Measure voltage"],
            safety_notes=["Wear eye protection"],
            status=Lesson.Status.PUBLISHED,
        )
        lesson.competencies.add(competency)
        self.assignment = Assignment.objects.create(
            lesson=lesson,
            learner=self.learner,
            assigned_by=self.instructor,
        )
        self.steps = [
            ProcedureStep.objects.create(
                lesson=lesson,
                order=1,
                code="ppe",
                title="Wear eye protection",
                instruction="Put on the safety glasses.",
                action_code="confirm_ppe",
                feedback="Eye protection confirmed.",
                safety_critical=True,
            ),
            ProcedureStep.objects.create(
                lesson=lesson,
                order=2,
                code="meter-mode",
                title="Set the meter",
                instruction="Select DC voltage.",
                action_code="set_meter_dc",
                feedback="DC voltage selected.",
            ),
        ]

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
        self.assertEqual(Attempt.objects.count(), 1)
        self.assertEqual(AttemptEvent.objects.get().event_type, "attempt_started")

    def test_attempt_enforces_order_resumes_and_scores_on_the_server(self):
        self.client.force_login(self.learner)
        started = self.client.post(f"/api/v1/assignments/{self.assignment.pk}/start/")
        attempt_id = started.json()["attempt"]["id"]
        action_url = f"/api/v1/attempts/{attempt_id}/actions/"

        early = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")
        self.assertEqual(early.status_code, 400)

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
        self.assertEqual(completed.json()["attempt"]["score"], "85.00")
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

    def test_attempts_are_private_to_their_learner(self):
        attempt = Attempt.objects.create(assignment=self.assignment, learner=self.learner)
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
        attempt = Attempt.objects.create(assignment=self.assignment, learner=self.learner)

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
