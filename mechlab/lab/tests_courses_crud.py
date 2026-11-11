"""Course access levels, the public Courses API, and create/read/update/delete everywhere."""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import Client, TestCase

from .models import (
    Assignment,
    Cohort,
    Competency,
    ContactMessage,
    Course,
    Lesson,
    Module,
    Program,
    School,
    SchoolMembership,
)

PASSWORD = "a-long-test-password-1"


def make_user(username, **extra):
    return get_user_model().objects.create_user(
        username=username, email=extra.pop("email", username), password=PASSWORD, **extra
    )


class LoadedContentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_lessons", stdout=open("/dev/null", "w"))

    def test_built_in_courses_get_access_levels_and_details(self):
        automotive = Course.objects.get(slug="automotive-electrical-foundations")
        self.assertEqual(automotive.access, Course.Access.PUBLIC)
        self.assertTrue(automotive.open_enrollment)
        self.assertTrue(automotive.outcomes)
        electrical = Course.objects.get(slug="electrical-installation-foundations")
        self.assertEqual(electrical.access, Course.Access.ACCOUNT)

    def test_load_lessons_keeps_edits_on_later_deploys(self):
        course = Course.objects.get(slug="workshop-safety-essentials")
        course.title = "Edited title"
        course.access = Course.Access.MEMBERS
        course.save()
        call_command("load_lessons", stdout=open("/dev/null", "w"))
        course.refresh_from_db()
        self.assertEqual(course.title, "Edited title")
        self.assertEqual(course.access, Course.Access.MEMBERS)
        self.assertFalse(course.open_enrollment)

    def test_public_courses_list_and_detail(self):
        client = Client()
        listing = client.get("/api/v1/courses/").json()["courses"]
        self.assertEqual(
            {course["slug"]: course["access"] for course in listing},
            {
                "automotive-electrical-foundations": "public",
                "electrical-installation-foundations": "account",
                "workshop-safety-essentials": "public",
            },
        )
        detail = client.get("/api/v1/courses/automotive-electrical-foundations/").json()
        self.assertIn("outcomes", detail)
        self.assertTrue(all(lesson["canTry"] for lesson in detail["lessons"]))
        lesson_id = detail["lessons"][0]["id"]
        practice = client.get(
            f"/api/v1/courses/automotive-electrical-foundations/lessons/{lesson_id}/practice/"
        )
        self.assertEqual(practice.status_code, 200)

    def test_account_and_members_courses_cannot_be_tried_anonymously(self):
        client = Client()
        detail = client.get("/api/v1/courses/electrical-installation-foundations/").json()
        self.assertFalse(any(lesson["canTry"] for lesson in detail["lessons"]))
        self.assertTrue(all(lesson["canEnrol"] for lesson in detail["lessons"]))
        lesson_id = detail["lessons"][0]["id"]
        self.assertEqual(
            client.get(
                f"/api/v1/courses/electrical-installation-foundations/lessons/{lesson_id}/practice/"
            ).status_code,
            404,
        )

    def test_work_by_a_learner_blocks_deleting_the_lesson_and_course(self):
        course = Course.objects.get(slug="electrical-installation-foundations")
        lesson = course.lessons.filter(status=Lesson.Status.PUBLISHED).first()
        learner = make_user("learner@example.com")
        learner_client = Client()
        learner_client.force_login(learner)
        enrol = learner_client.post(f"/api/v1/catalogue/{lesson.pk}/enroll/")
        self.assertEqual(enrol.status_code, 201, enrol.content)
        root = Client()
        root.force_login(make_user("root@example.com", is_superuser=True))
        self.assertEqual(root.delete(f"/api/v1/content/lessons/{lesson.pk}/").status_code, 409)
        self.assertEqual(root.delete(f"/api/v1/content/courses/{course.pk}/").status_code, 409)
        self.assertTrue(Assignment.objects.filter(lesson=lesson).exists())

    def test_unpublished_course_is_hidden(self):
        Course.objects.filter(slug="workshop-safety-essentials").update(is_published=False)
        self.assertEqual(
            Client().get("/api/v1/courses/workshop-safety-essentials/").status_code, 404
        )


class StudioCrudTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Kigali TSS", code="kigali-tss")
        self.admin = make_user("admin@example.com")
        SchoolMembership.objects.create(
            school=self.school, user=self.admin, role=SchoolMembership.Role.ADMIN
        )
        self.author = make_user("author@example.com")
        SchoolMembership.objects.create(
            school=self.school, user=self.author, role=SchoolMembership.Role.CONTENT_AUTHOR
        )
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/content/courses/",
            {
                "title": "Brakes",
                "trade": "Automotive",
                "description": "",
                "summary": "Inspect and service brakes.",
                "access": "account",
                "level": "intermediate",
                "ageGroup": "16 and over",
                "durationHours": 5,
                "delivery": "blended",
                "outcomes": ["Measure pad wear", "  "],
                "prerequisites": ["Workshop safety"],
                "requirements": ["A phone"],
                "isPublished": True,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.course = Course.objects.get(title="Brakes")

    def test_course_details_are_saved_and_editable(self):
        self.assertEqual(self.course.outcomes, ["Measure pad wear"])
        self.assertEqual(self.course.age_group, "16 and over")
        self.assertTrue(self.course.open_enrollment)
        response = self.client.patch(
            f"/api/v1/content/courses/{self.course.pk}/",
            {"access": "members", "level": "advanced"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.course.refresh_from_db()
        self.assertEqual(self.course.access, "members")
        self.assertFalse(self.course.open_enrollment)

    def test_modules_rename_reorder_and_delete(self):
        url = f"/api/v1/content/courses/{self.course.pk}/modules/"
        first = self.client.post(url, {"title": "One"}, content_type="application/json").json()
        second = self.client.post(url, {"title": "Two"}, content_type="application/json").json()
        renamed = self.client.patch(
            f"{url}{first['id']}/", {"title": "Intro"}, content_type="application/json"
        )
        self.assertEqual(renamed.json()["title"], "Intro")
        self.client.patch(f"{url}{second['id']}/", {"move": "up"}, content_type="application/json")
        self.assertEqual(
            list(self.course.modules.order_by("order").values_list("title", flat=True)),
            ["Two", "Intro"],
        )
        Lesson.objects.create(
            course=self.course,
            module_id=second["id"],
            slug="l",
            title="L",
            summary="s",
            authored_by=self.admin,
        )
        self.assertEqual(self.client.delete(f"{url}{second['id']}/").status_code, 409)
        self.assertEqual(self.client.delete(f"{url}{first['id']}/").status_code, 204)
        self.assertFalse(Module.objects.filter(pk=first["id"]).exists())

    def test_competencies_edit_and_delete(self):
        url = f"/api/v1/content/courses/{self.course.pk}/competencies/"
        made = self.client.post(
            url, {"code": "b-1", "title": "Inspect"}, content_type="application/json"
        ).json()
        edited = self.client.patch(
            f"{url}{made['id']}/",
            {"code": "brk-1", "title": "Inspect pads"},
            content_type="application/json",
        )
        self.assertEqual(edited.json()["code"], "BRK-1")
        self.assertEqual(self.client.delete(f"{url}{made['id']}/").status_code, 204)
        self.assertFalse(Competency.objects.filter(pk=made["id"]).exists())

    def _lesson(self, status=Lesson.Status.PUBLISHED):
        return Lesson.objects.create(
            course=self.course,
            slug=f"lesson-{status}",
            title="Pads",
            summary="s",
            status=status,
            authored_by=self.author,
        )

    def test_admin_edits_a_published_lesson_but_an_author_cannot(self):
        lesson = self._lesson()
        response = self.client.patch(
            f"/api/v1/content/lessons/{lesson.pk}/",
            {"title": "Brake pads"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        lesson.refresh_from_db()
        self.assertEqual(lesson.title, "Brake pads")
        moved = self.client.patch(
            f"/api/v1/content/lessons/{lesson.pk}/", {"slug": "x"}, content_type="application/json"
        )
        lesson.refresh_from_db()
        self.assertNotEqual(lesson.slug, "x", moved.content)
        author = Client()
        author.force_login(self.author)
        refused = author.patch(
            f"/api/v1/content/lessons/{lesson.pk}/", {"title": "X"}, content_type="application/json"
        )
        self.assertEqual(refused.status_code, 409)

    def test_lesson_and_course_delete_only_without_learner_work(self):
        lesson = self._lesson(status=Lesson.Status.DRAFT)
        self.assertEqual(
            self.client.delete(f"/api/v1/content/lessons/{lesson.pk}/").status_code, 204
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/content/courses/{self.course.pk}/").status_code, 204
        )

    def test_class_delete_only_when_it_never_had_learners(self):
        program = Program.objects.create(school=self.school, code="auto", name="Auto")
        empty = Cohort.objects.create(school=self.school, program=program, code="a", name="A")
        self.assertEqual(self.client.delete(f"/api/v1/school/cohorts/{empty.pk}/").status_code, 204)


class PlatformCrudTests(TestCase):
    def setUp(self):
        self.root = make_user("root@example.com", is_superuser=True)
        self.client.force_login(self.root)

    def test_rename_switch_off_and_delete_an_empty_school(self):
        school = School.objects.create(name="Old", code="old")
        url = f"/api/v1/platform/schools/{school.pk}/"
        self.assertEqual(
            self.client.patch(
                url, {"name": "New", "isActive": False}, content_type="application/json"
            ).json()["name"],
            "New",
        )
        school.refresh_from_db()
        self.assertFalse(school.is_active)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_a_school_with_people_is_not_deleted(self):
        school = School.objects.create(name="Busy", code="busy")
        SchoolMembership.objects.create(
            school=school, user=make_user("p@example.com"), role=SchoolMembership.Role.LEARNER
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/platform/schools/{school.pk}/").status_code, 409
        )

    def test_contact_message_delete(self):
        message = ContactMessage.objects.create(name="A", email="a@example.com", message="Hi")
        self.assertEqual(self.client.delete(f"/api/v1/contact/{message.pk}/").status_code, 204)
