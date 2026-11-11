"""Backend changes made for the 11 November 2026 QA report (docs/qa/2026-11-11-production-qa.md)."""

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.test import Client, TestCase, override_settings

from .models import (
    AuditEvent,
    Cohort,
    ContactMessage,
    Lesson,
    School,
    SchoolMembership,
    SchoolRegistrationRequest,
)

PASSWORD = "a-long-test-password-1"


def make_user(username, **extra):
    user = get_user_model().objects.create_user(
        username=username, email=extra.pop("email", username), password=PASSWORD, **extra
    )
    return user


class LoadLessonsTests(TestCase):
    """B-1: production can get the built-in lessons without demonstration accounts."""

    def test_load_lessons_is_repeatable_and_creates_no_people(self):
        call_command("load_lessons", stdout=open("/dev/null", "w"))
        call_command("load_lessons", stdout=open("/dev/null", "w"))
        self.assertGreaterEqual(Lesson.objects.filter(status=Lesson.Status.PUBLISHED).count(), 4)
        self.assertEqual(
            list(get_user_model().objects.values_list("username", "is_active")),
            [("opedu-curriculum", False)],
        )
        self.assertFalse(get_user_model().objects.get().has_usable_password())
        self.assertEqual(Client().get("/api/v1/demo/").status_code, 200)


class PlatformSchoolsTests(TestCase):
    """B-2: a platform administrator creates schools and decides requests in the app."""

    def setUp(self):
        self.admin = make_user("root@example.com", is_superuser=True, is_staff=True)
        self.client.force_login(self.admin)

    def test_create_school_and_join_as_administrator(self):
        response = self.client.post(
            "/api/v1/platform/schools/",
            {"name": "Kigali TSS", "kind": "school", "joinAsAdministrator": True},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        school = School.objects.get(name="Kigali TSS")
        self.assertTrue(
            SchoolMembership.objects.filter(
                school=school, user=self.admin, role=SchoolMembership.Role.ADMIN
            ).exists()
        )
        me = self.client.get("/api/v1/auth/me/").json()["user"]
        self.assertEqual(me["organization"], "Kigali TSS")
        duplicate = self.client.post(
            "/api/v1/platform/schools/",
            {"name": "kigali tss"},
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_approve_registration_without_email_returns_the_link(self):
        record = SchoolRegistrationRequest.objects.create(
            organisation_name="Musanze Garage", contact_name="Eric", email="eric@example.com"
        )
        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            response = self.client.post(f"/api/v1/platform/registrations/{record.pk}/approve/")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertFalse(body["emailSent"])
        self.assertIn("/join/", body["acceptUrl"])
        again = self.client.post(f"/api/v1/platform/registrations/{record.pk}/decline/")
        self.assertEqual(again.status_code, 409)

    def test_only_platform_administrators(self):
        other = make_user("teacher@example.com")
        client = Client()
        client.force_login(other)
        self.assertEqual(client.get("/api/v1/platform/schools/").status_code, 403)


class HonestEmailTests(TestCase):
    """A-1: without a mail server nothing claims an email was sent."""

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_password_reset_says_email_is_not_set_up(self):
        make_user("learner@example.com")
        response = Client().post(
            "/api/v1/auth/password/reset/",
            {"email": "learner@example.com"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["emailConfigured"])
        self.assertIn("not set up", response.json()["detail"])

    def test_signed_in_payload_reports_email_delivery(self):
        user = make_user("person@example.com")
        self.client.force_login(user)
        self.assertTrue(self.client.get("/api/v1/auth/me/").json()["user"]["features"]["email"])


class ProfileTests(TestCase):
    """A-4: people edit their own name and email."""

    def setUp(self):
        self.user = make_user("old@example.com")
        make_user("taken@example.com")
        self.client.force_login(self.user)

    def test_name_changes_without_a_password(self):
        response = self.client.post(
            "/api/v1/auth/profile/",
            {"firstName": " Aline ", "lastName": "Uwase", "email": "old@example.com"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["firstName"], "Aline")
        self.assertTrue(AuditEvent.objects.filter(event_type="account.profile_updated").exists())

    def test_email_change_needs_the_password_and_a_free_address(self):
        no_password = self.client.post(
            "/api/v1/auth/profile/", {"email": "new@example.com"}, content_type="application/json"
        )
        self.assertEqual(no_password.status_code, 400)
        self.assertIn("currentPassword", no_password.json())
        taken = self.client.post(
            "/api/v1/auth/profile/",
            {"email": "taken@example.com", "currentPassword": PASSWORD},
            content_type="application/json",
        )
        self.assertIn("email", taken.json())
        changed = self.client.post(
            "/api/v1/auth/profile/",
            {"email": "New@Example.com", "currentPassword": PASSWORD},
            content_type="application/json",
        )
        self.assertEqual(changed.status_code, 200, changed.content)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")


class ResetLinkCheckTests(TestCase):
    """A-6: an invalid reset link is reported when the page opens."""

    def test_get_reports_an_invalid_link(self):
        response = Client().get("/api/v1/auth/password/reset/xx/bad-token/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "reset_link_invalid")


class SchoolAdminListTests(TestCase):
    """D-1, D-2, D-4, F-1: pages, filters, exports and duplicate protection."""

    def setUp(self):
        self.school = School.objects.create(name="Kigali TSS", code="kigali-tss")
        self.admin = make_user("admin@example.com", first_name="Ada")
        SchoolMembership.objects.create(
            school=self.school, user=self.admin, role=SchoolMembership.Role.ADMIN
        )
        for index in range(60):
            learner = make_user(f"learner{index}@example.com", first_name=f"Learner {index}")
            SchoolMembership.objects.create(
                school=self.school, user=learner, role=SchoolMembership.Role.LEARNER
            )
        self.client.force_login(self.admin)

    def test_members_are_paged_and_searched_on_the_server(self):
        first = self.client.get("/api/v1/school/members/?page=1").json()
        self.assertEqual(first["count"], 61)
        self.assertEqual(len(first["results"]), 50)
        search = self.client.get("/api/v1/school/members/?page=1&search=learner 5").json()
        self.assertEqual(search["count"], 11)
        legacy = self.client.get("/api/v1/school/members/").json()
        self.assertEqual(len(legacy), 61)

    def test_csv_exports(self):
        people = self.client.get("/api/v1/school/members/export/?role=admin")
        self.assertEqual(people["Content-Type"], "text/csv; charset=utf-8")
        text = people.content.decode("utf-8-sig")
        self.assertIn("admin@example.com", text)
        self.assertNotIn("learner1@example.com", text)
        audit = self.client.get("/api/v1/school/audit/export/?from=2000-01-01")
        self.assertEqual(audit.status_code, 200)
        bad = self.client.get("/api/v1/school/audit/?from=yesterday")
        self.assertEqual(bad.status_code, 400)

    def test_a_repeated_create_class_makes_one_class(self):
        payload = {"name": "Level 3 A", "programName": "Automobile Technology"}
        first = self.client.post(
            "/api/v1/school/cohorts/", payload, content_type="application/json"
        )
        second = self.client.post(
            "/api/v1/school/cohorts/", payload, content_type="application/json"
        )
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(Cohort.objects.filter(school=self.school, name="Level 3 A").count(), 1)

    def test_activity_counts_each_day(self):
        response = self.client.get("/api/v1/instructor/activity/?from=2026-01-01&to=2026-01-07")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(response.json()["days"]), 7)


class ContactTests(TestCase):
    """F-5: the contact form reaches the team."""

    @override_settings(OPEDU_CONTACT_EMAIL="team@example.com")
    def test_message_is_kept_and_emailed(self):
        response = Client().post(
            "/api/v1/contact/",
            {
                "name": "Aline",
                "email": "aline@example.com",
                "topic": "school_pilot",
                "message": "We would like a pilot.",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(ContactMessage.objects.count(), 1)
        self.assertEqual(mail.outbox[0].to, ["team@example.com"])
        self.assertEqual(Client().get("/api/v1/contact/").status_code, 403)


class ResearchVisibilityTests(TestCase):
    """U-10, Q-2: research tools only while a study runs; no 403 for the platform admin."""

    def test_platform_admin_sees_research_only_when_a_school_runs_a_study(self):
        admin = make_user("root@example.com", is_superuser=True)
        self.client.force_login(admin)
        features = self.client.get("/api/v1/auth/me/").json()["user"]["features"]
        self.assertFalse(features["research"])
        self.assertEqual(self.client.get("/api/v1/research/pilots/options/").status_code, 200)
        School.objects.create(name="Study", code="study", research_enabled=True)
        features = self.client.get("/api/v1/auth/me/").json()["user"]["features"]
        self.assertTrue(features["research"])
