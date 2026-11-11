"""Fault cases, consequences, practice runs, class access, open learning and certificates."""

from io import StringIO

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .access import approve_school_registration, pin_problem
from .models import (
    Assignment,
    Attempt,
    Cohort,
    Course,
    Enrollment,
    LearnerProfile,
    Lesson,
    School,
    SchoolMembership,
    SchoolRegistrationRequest,
    SimulationScenario,
    XApiDelivery,
)
from .scenario_runtime import resolved_steps, scenario_variants
from .scenario_validation import validate_scenario_for_publication

PASSWORD = "Workshop-Demo-2026"


class SeededTestCase(TestCase):
    """The demonstration school, its lessons and one learner with every lesson assigned."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", "--password", PASSWORD, stdout=StringIO())
        cls.learner = User.objects.get(username="learner@opedu.local")
        cls.instructor = User.objects.get(username="instructor@opedu.local")
        cls.school = School.objects.get(code="kigali-demo-tss")
        cls.cohort = Cohort.objects.get(school=cls.school, code="auto-2026")

    def setUp(self):
        cache.clear()
        self.client = Client()

    def sign_in(self, user=None):
        self.client.force_login(user or self.learner)

    def assignment_for(self, slug):
        return Assignment.objects.filter(learner=self.learner, lesson__slug=slug).latest(
            "scenario__version"
        )

    def start(self, slug, **body):
        assignment = self.assignment_for(slug)
        response = self.client.post(
            f"/api/v1/assignments/{assignment.pk}/start/", body, content_type="application/json"
        )
        return assignment, response

    def act(self, attempt_id, action):
        return self.client.post(
            f"/api/v1/attempts/{attempt_id}/actions/",
            {"action": action},
            content_type="application/json",
        )

    def complete_correctly(self, attempt_id):
        attempt = Attempt.objects.get(pk=attempt_id)
        for step in resolved_steps(attempt.scenario.definition, attempt.variant_code):
            response = self.act(attempt_id, step["action_code"])
            self.assertTrue(response.json()["correct"], step["code"])
        return self.client.post(f"/api/v1/attempts/{attempt_id}/complete/")


class SeededContentTests(SeededTestCase):
    def test_every_seeded_scenario_passes_publication_checks(self):
        scenarios = SimulationScenario.objects.all()
        self.assertGreaterEqual(scenarios.count(), 6)
        for scenario in scenarios:
            validate_scenario_for_publication(scenario)

    def test_every_fault_case_can_be_completed_with_full_marks(self):
        self.sign_in()
        for scenario in SimulationScenario.objects.exclude(definition__variants=None):
            for variant in scenario_variants(scenario.definition):
                steps = resolved_steps(scenario.definition, variant["code"])
                self.assertEqual(len(steps), len(scenario.definition["steps"]))
                for step in steps:
                    accepted = {item["action_code"] for item in step["acceptable_actions"]}
                    self.assertIn(step["action_code"], accepted)
                    if step.get("choices"):
                        self.assertIn(
                            step["action_code"], {item["action_code"] for item in step["choices"]}
                        )

    def test_seeding_twice_changes_nothing(self):
        before = (SimulationScenario.objects.count(), Assignment.objects.count())
        call_command("seed_demo", "--password", PASSWORD, stdout=StringIO())
        self.assertEqual(before, (SimulationScenario.objects.count(), Assignment.objects.count()))


class FaultCaseTests(SeededTestCase):
    slug = "battery-inspection-and-diagnosis"

    def test_attempt_gets_a_fault_case_and_sees_its_reading(self):
        self.sign_in()
        _, response = self.start(self.slug)
        self.assertEqual(response.status_code, 201)
        attempt = Attempt.objects.get(pk=response.json()["attempt"]["id"])
        self.assertIn(attempt.variant_code, {"charged", "low-charge", "dead-cell"})
        detail = self.client.get(f"/api/v1/attempts/{attempt.pk}/").json()
        steps = {step["code"]: step for step in detail["assignment"]["lesson"]["procedure_steps"]}
        expected = {"charged": 12.6, "low-charge": 12.1, "dead-cell": 10.5}[attempt.variant_code]
        self.assertEqual(steps["read-voltage"]["metadata"]["reading"], expected)
        # The learner is never told which case it is by name.
        self.assertNotIn("variant_code", detail)
        self.assertEqual(len(steps["diagnosis"]["choices"]), 3)

    def test_the_right_diagnosis_depends_on_the_fault_case(self):
        self.sign_in()
        _, response = self.start(self.slug)
        attempt = Attempt.objects.get(pk=response.json()["attempt"]["id"])
        attempt.variant_code = "low-charge"
        attempt.save(update_fields=["variant_code"])
        for action in (
            "confirm_ppe",
            "turn_ignition_off",
            "set_meter_dc",
            "connect_black_negative",
            "connect_red_positive",
            "read_voltage",
        ):
            self.assertTrue(self.act(attempt.pk, action).json()["correct"], action)
        wrong = self.act(attempt.pk, "choose_serviceable").json()
        self.assertFalse(wrong["correct"])
        self.assertIn("12.1 V", wrong["message"])
        self.assertTrue(self.act(attempt.pk, "choose_recharge").json()["correct"])
        result = self.client.post(f"/api/v1/attempts/{attempt.pk}/complete/").json()["attempt"]
        self.assertEqual(result["status"], "completed")
        self.assertEqual(float(result["score"]), 95.0)

    def test_a_repeat_attempt_gets_a_different_fault_case(self):
        self.sign_in()
        _, first = self.start(self.slug)
        first_attempt = Attempt.objects.get(pk=first.json()["attempt"]["id"])
        self.client.post(f"/api/v1/attempts/{first_attempt.pk}/abandon/")
        _, second = self.start(self.slug)
        second_attempt = Attempt.objects.get(pk=second.json()["attempt"]["id"])
        self.assertNotEqual(first_attempt.variant_code, second_attempt.variant_code)

    def test_a_dangerous_action_returns_its_consequence(self):
        self.sign_in()
        _, response = self.start(self.slug)
        attempt_id = response.json()["attempt"]["id"]
        early = self.act(attempt_id, "connect_red_positive").json()
        self.assertFalse(early["correct"])
        self.assertEqual(early["consequence"]["effect"], "hazard")
        self.assertIn("eye protection", early["message"])
        self.act(attempt_id, "confirm_ppe")
        self.act(attempt_id, "turn_ignition_off")
        amps = self.act(attempt_id, "set_meter_amps").json()
        self.assertEqual(amps["consequence"]["effect"], "blown_fuse")
        event = (
            Attempt.objects.get(pk=attempt_id).events.filter(event_type="incorrect_action").last()
        )
        self.assertEqual(event.payload["consequence"], "blown_fuse")

    def test_instructor_sees_which_fault_case_was_given(self):
        self.sign_in()
        _, response = self.start(self.slug)
        attempt = Attempt.objects.get(pk=response.json()["attempt"]["id"])
        self.sign_in(self.instructor)
        review = self.client.get(f"/api/v1/instructor/attempts/{attempt.pk}/").json()
        self.assertEqual(review["variant_code"], attempt.variant_code)


class FreeSequenceTests(SeededTestCase):
    slug = "workshop-hazard-hunt"

    def test_hazards_can_be_found_in_any_order(self):
        self.sign_in()
        _, response = self.start(self.slug)
        attempt_id = response.json()["attempt"]["id"]
        last = self.act(attempt_id, "spot_tools_on_floor").json()
        self.assertTrue(last["correct"])
        self.assertEqual(last["attempt"]["resume_state"]["completedSteps"], ["tools-on-floor"])
        again = self.act(attempt_id, "spot_tools_on_floor").json()
        self.assertTrue(again["correct"])
        self.assertIn("already", again["message"])
        safe = self.act(attempt_id, "spot_first_aid").json()
        self.assertFalse(safe["correct"])
        self.assertIn("first-aid box", safe["message"])
        attempt = Attempt.objects.get(pk=attempt_id)
        self.assertEqual(attempt.events.filter(event_type="incorrect_action").count(), 1)
        for action in (
            "spot_open_fuel",
            "spot_oil_spill",
            "spot_blocked_extinguisher",
            "spot_frayed_cable",
        ):
            self.assertTrue(self.act(attempt_id, action).json()["correct"])
        result = self.client.post(f"/api/v1/attempts/{attempt_id}/complete/").json()["attempt"]
        self.assertEqual(float(result["score"]), 95.0)

    def test_scenario_summary_declares_the_free_sequence_and_scene(self):
        self.sign_in()
        assignment = self.assignment_for(self.slug)
        scenario = self.client.get(f"/api/v1/assignments/{assignment.pk}/").json()["scenario"]
        self.assertEqual(scenario["sequence"], "free")
        self.assertEqual(scenario["scene"]["layout"], "floor")


class KnowledgeCheckTests(SeededTestCase):
    slug = "battery-inspection-and-diagnosis"

    def test_questions_are_served_without_answers_and_marked_on_the_server(self):
        self.sign_in()
        assignment = self.assignment_for(self.slug)
        body = self.client.get(f"/api/v1/assignments/{assignment.pk}/").content.decode()
        scenario = self.client.get(f"/api/v1/assignments/{assignment.pk}/").json()["scenario"]
        self.assertEqual(len(scenario["knowledge_check"]), 3)
        self.assertNotIn("explanation", body)
        self.assertNotIn('"answer"', body)
        response = self.client.post(
            f"/api/v1/assignments/{assignment.pk}/knowledge-check/",
            {
                "answers": [
                    {"questionCode": "eye-protection", "response": "acid"},
                    {"questionCode": "meter-setting", "response": "amps"},
                    {"questionCode": "ignition", "response": "off"},
                ]
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        saved = response.json()
        self.assertEqual(float(saved["score"]), 66.67)
        marks = {item["questionCode"]: item for item in saved["results"]}
        self.assertTrue(marks["eye-protection"]["correct"])
        self.assertFalse(marks["meter-setting"]["correct"])
        self.assertEqual(marks["meter-setting"]["correctOption"], "dc")
        self.assertIn("short circuit", marks["meter-setting"]["explanation"])


class PracticeAttemptTests(SeededTestCase):
    slug = "jump-starting-safely"

    def test_practice_does_not_use_attempts_or_reach_the_instructor(self):
        self.sign_in()
        assignment = self.assignment_for(self.slug)
        assignment.attempt_limit = 1
        assignment.save()
        for _ in range(3):
            _, response = self.start(self.slug, practice=True)
            self.assertEqual(response.status_code, 201)
            attempt_id = response.json()["attempt"]["id"]
            self.assertTrue(response.json()["attempt"]["is_practice"])
            done = self.complete_correctly(attempt_id).json()["attempt"]
            self.assertEqual(done["outcome"], "mastered")
        self.assertEqual(XApiDelivery.objects.count(), 0)
        _, assessed = self.start(self.slug)
        self.assertEqual(assessed.status_code, 201)
        self.assertFalse(assessed.json()["attempt"]["is_practice"])

        self.sign_in(self.instructor)
        overview = self.client.get("/api/v1/instructor/overview/").json()
        self.assertEqual(
            [item["id"] for item in overview["attempts"]], [assessed.json()["attempt"]["id"]]
        )
        practice_id = Attempt.objects.filter(is_practice=True).first().pk
        self.assertEqual(
            self.client.get(f"/api/v1/instructor/attempts/{practice_id}/").status_code, 404
        )

    def test_one_kind_of_attempt_is_open_at_a_time(self):
        self.sign_in()
        _, practice = self.start(self.slug, practice=True)
        self.assertEqual(practice.status_code, 201)
        _, assessed = self.start(self.slug)
        self.assertEqual(assessed.status_code, 409)
        self.assertEqual(assessed.json()["code"], "other_attempt_open")
        _, resumed = self.start(self.slug, practice=True)
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["attempt"]["id"], practice.json()["attempt"]["id"])


class ClassAccessTests(SeededTestCase):
    def test_pin_rules(self):
        self.assertIsNone(pin_problem("408193"))
        for weak in ("123456", "654321", "111111", "121212", "12345", "abcdef", "901234"):
            self.assertIsNotNone(pin_problem(weak), weak)

    def test_instructor_issues_slips_and_the_learner_signs_in_with_a_pin(self):
        self.sign_in(self.instructor)
        response = self.client.post(
            f"/api/v1/classes/{self.cohort.pk}/learners/",
            {"names": ["Aline Uwase", "  Eric   Mugisha ", "Aline Uwase", ""]},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        slips = response.json()["slips"]
        self.assertEqual(
            [slip["signInName"] for slip in slips], ["aline.uwase", "eric.mugisha", "aline.uwase2"]
        )
        self.assertTrue(all(len(slip["pin"]) == 6 and slip["pin"].isdigit() for slip in slips))
        user = User.objects.get(username="aline.uwase")
        self.assertTrue(user.learner_profile.uses_pin)
        self.assertTrue(
            Enrollment.objects.filter(cohort=self.cohort, learner=user, status="active").exists()
        )
        self.client.logout()
        signed_in = self.client.post(
            "/api/v1/auth/login/",
            {"email": "Aline.Uwase", "password": slips[0]["pin"]},
            content_type="application/json",
        )
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(signed_in.json()["user"]["roles"], ["learner"])
        self.assertTrue(signed_in.json()["user"]["usesPin"])

    def test_pin_accounts_lock_sooner_and_a_reset_lifts_the_lock(self):
        self.sign_in(self.instructor)
        slip = self.client.post(
            f"/api/v1/classes/{self.cohort.pk}/learners/",
            {"names": ["Jean Bosco"]},
            content_type="application/json",
        ).json()["slips"][0]
        guesser = Client()
        with override_settings(LOGIN_FAILURE_LIMIT=1000, PIN_LOGIN_FAILURE_LIMIT=3):
            for _ in range(3):
                wrong = guesser.post(
                    "/api/v1/auth/login/",
                    {"email": slip["signInName"], "password": "000001"},
                    content_type="application/json",
                )
                self.assertEqual(wrong.status_code, 401)
            locked = guesser.post(
                "/api/v1/auth/login/",
                {"email": slip["signInName"], "password": slip["pin"]},
                content_type="application/json",
            )
            self.assertEqual(locked.status_code, 429)
            user = User.objects.get(username=slip["signInName"])
            reset = self.client.post(f"/api/v1/classes/learners/{user.pk}/reset-pin/")
            self.assertEqual(reset.status_code, 200)
            self.assertNotEqual(reset.json()["pin"], slip["pin"])
            again = guesser.post(
                "/api/v1/auth/login/",
                {"email": slip["signInName"], "password": reset.json()["pin"]},
                content_type="application/json",
            )
            self.assertEqual(again.status_code, 200)

    def test_a_password_account_cannot_be_reset_to_a_pin_by_staff(self):
        self.sign_in(self.instructor)
        response = self.client.post(f"/api/v1/classes/learners/{self.learner.pk}/reset-pin/")
        self.assertEqual(response.status_code, 409)
        self.assertTrue(self.learner.check_password(PASSWORD))

    def test_learner_joins_with_the_code_on_the_board(self):
        code = self.cohort.join_code
        preview = self.client.get(f"/api/v1/auth/class/{code.lower()}/")
        self.assertEqual(preview.json()["className"], self.cohort.name)
        weak = self.client.post(
            f"/api/v1/auth/class/{code}/",
            {"firstName": "Diane", "lastName": "Keza", "pin": "123456"},
            content_type="application/json",
        )
        self.assertEqual(weak.status_code, 400)
        joined = self.client.post(
            f"/api/v1/auth/class/{code}/",
            {"firstName": "Diane", "lastName": "Keza", "pin": "408193", "phone": "0788 123 456"},
            content_type="application/json",
        )
        self.assertEqual(joined.status_code, 201)
        self.assertEqual(joined.json()["signInName"], "0788123456")
        self.assertEqual(self.client.get("/api/v1/auth/me/").json()["user"]["firstName"], "Diane")
        user = User.objects.get(username="0788123456")
        self.assertTrue(
            SchoolMembership.objects.filter(user=user, school=self.school, role="learner").exists()
        )
        self.assertTrue(Enrollment.objects.filter(cohort=self.cohort, learner=user).exists())

    def test_a_rotated_or_disabled_code_stops_working(self):
        old = self.cohort.join_code
        self.sign_in(self.instructor)
        rotated = self.client.post(
            f"/api/v1/classes/{self.cohort.pk}/join-code/",
            {"enabled": True},
            content_type="application/json",
        ).json()
        self.assertNotEqual(rotated["joinCode"], old)
        self.client.logout()
        self.assertEqual(self.client.get(f"/api/v1/auth/class/{old}/").status_code, 404)
        self.sign_in(self.instructor)
        self.client.post(
            f"/api/v1/classes/{self.cohort.pk}/join-code/",
            {"enabled": False},
            content_type="application/json",
        )
        self.client.logout()
        self.assertEqual(
            self.client.get(f"/api/v1/auth/class/{rotated['joinCode']}/").status_code, 404
        )

    def test_class_tools_are_staff_only_and_scoped_to_their_school(self):
        self.sign_in()
        self.assertEqual(self.client.get("/api/v1/classes/access/").status_code, 403)
        other = School.objects.create(name="Other School", code="other-school")
        outsider = User.objects.create_user("outsider@opedu.local", password=PASSWORD)
        SchoolMembership.objects.create(school=other, user=outsider, role="instructor")
        self.sign_in(outsider)
        self.assertEqual(self.client.get("/api/v1/classes/access/").json()["classes"], [])
        response = self.client.post(
            f"/api/v1/classes/{self.cohort.pk}/learners/",
            {"names": ["Nobody Here"]},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_public_sign_up_views_enforce_csrf(self):
        strict = Client(enforce_csrf_checks=True)
        response = strict.post(
            f"/api/v1/auth/class/{self.cohort.join_code}/",
            {"firstName": "Diane", "lastName": "Keza", "pin": "408193"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(first_name="Diane").exists())


class OpenLearningTests(SeededTestCase):
    def register(self, **overrides):
        body = {
            "firstName": "Claude",
            "lastName": "Niyonzima",
            "signInName": "claude.n",
            "password": "garage-apprentice-77",
            **overrides,
        }
        return self.client.post("/api/v1/auth/register/", body, content_type="application/json")

    def test_someone_without_a_school_registers_enrols_and_practises(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="claude.n")
        self.assertTrue(user.school_memberships.get().school.is_open)
        catalogue = self.client.get("/api/v1/catalogue/").json()["lessons"]
        self.assertGreaterEqual(len(catalogue), 5)
        hazard = next(item for item in catalogue if item["title"] == "Workshop Hazard Hunt")
        self.assertIsNone(hazard["assignmentId"])
        self.assertEqual(hazard["provider"], self.school.name)
        enrolled = self.client.post(f"/api/v1/catalogue/{hazard['lessonId']}/enroll/")
        self.assertEqual(enrolled.status_code, 201)
        assignment_id = enrolled.json()["assignmentId"]
        again = self.client.post(f"/api/v1/catalogue/{hazard['lessonId']}/enroll/")
        self.assertEqual(again.json()["assignmentId"], assignment_id)
        self.assertEqual(self.client.get("/api/v1/assignments/").json()["count"], 1)
        started = self.client.post(f"/api/v1/assignments/{assignment_id}/start/")
        self.assertEqual(started.status_code, 201)

    def test_registration_validates_and_can_be_switched_off(self):
        self.assertEqual(self.register(password="short").status_code, 400)
        self.assertEqual(self.register(signInName="a b").status_code, 400)
        self.assertEqual(self.register(signInName="learner@opedu.local").status_code, 400)
        with override_settings(OPEN_REGISTRATION=False):
            closed = self.register()
            self.assertEqual(closed.status_code, 403)
            self.assertFalse(self.client.get("/api/v1/open/status/").json()["openRegistration"])
        self.assertFalse(User.objects.filter(username="claude.n").exists())

    def test_closed_courses_stay_out_of_the_catalogue(self):
        Course.objects.filter(slug="workshop-safety-essentials").update(open_enrollment=False)
        self.register()
        lesson = Lesson.objects.get(slug="workshop-hazard-hunt")
        titles = [item["title"] for item in self.client.get("/api/v1/catalogue/").json()["lessons"]]
        self.assertNotIn("Workshop Hazard Hunt", titles)
        self.assertEqual(
            self.client.post(f"/api/v1/catalogue/{lesson.pk}/enroll/").status_code, 404
        )

    def test_visitor_demo_needs_no_account_and_records_nothing(self):
        before = Attempt.objects.count()
        response = self.client.get("/api/v1/demo/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lesson"]["title"], "Battery Inspection and Diagnosis")
        self.assertEqual(len(payload["lesson"]["procedure_steps"]), 7)
        self.assertTrue(payload["scenario"]["scene"]["props"])
        self.assertNotIn('"answer"', response.content.decode())
        self.assertEqual(Attempt.objects.count(), before)

    def test_school_registration_is_reviewed_before_anything_is_created(self):
        response = self.client.post(
            "/api/v1/schools/register/",
            {
                "organisationName": "Gisenyi Auto Garage",
                "kind": "workshop",
                "contactName": "Marie Ingabire",
                "email": "Marie@garage.example",
                "district": "Kigali",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        record = SchoolRegistrationRequest.objects.get()
        self.assertEqual(record.status, "pending")
        self.assertFalse(School.objects.filter(name="Gisenyi Auto Garage").exists())
        admin = User.objects.create_superuser("root", "root@opedu.local", PASSWORD)
        school, accept_url, sent = approve_school_registration(record, admin)
        self.assertEqual(school.kind, "workshop")
        self.assertTrue(sent)
        self.assertIn("/join/", accept_url)
        self.assertIn(accept_url, mail.outbox[-1].body)
        self.assertEqual(school.invitations.get().role, "admin")
        with self.assertRaises(ValueError):
            approve_school_registration(record, admin)

    def test_research_tools_follow_the_school_flag(self):
        self.sign_in()
        self.assertTrue(self.client.get("/api/v1/auth/me/").json()["user"]["features"]["research"])
        School.objects.filter(pk=self.school.pk).update(research_enabled=False)
        self.assertFalse(self.client.get("/api/v1/auth/me/").json()["user"]["features"]["research"])


class CertificateTests(SeededTestCase):
    slug = "jump-starting-safely"

    def test_a_passed_attempt_earns_a_checkable_certificate_that_claims_only_what_happened(self):
        self.sign_in()
        _, started = self.start(self.slug)
        attempt_id = started.json()["attempt"]["id"]
        self.assertEqual(
            self.client.get(f"/api/v1/attempts/{attempt_id}/certificate/").status_code, 409
        )
        self.complete_correctly(attempt_id)
        certificate = self.client.get(f"/api/v1/attempts/{attempt_id}/certificate/").json()
        self.assertEqual(certificate["level"], "simulation_passed")
        self.assertIn("only by a qualified instructor", certificate["statement"])
        anonymous = Client()
        verified = anonymous.get(f"/api/v1/certificates/verify/{certificate['code']}/").json()
        self.assertTrue(verified["valid"])
        self.assertEqual(verified["learnerName"], "Demo Learner")
        self.assertEqual(verified["lessonTitle"], "Jump-Starting a Flat Battery Safely")
        self.assertNotIn("code", verified)
        tampered = certificate["code"][:-2] + "xx"
        self.assertEqual(anonymous.get(f"/api/v1/certificates/verify/{tampered}/").status_code, 404)

    def test_self_study_and_practice_are_labelled_honestly(self):
        self.sign_in()
        _, practice = self.start(self.slug, practice=True)
        practice_id = practice.json()["attempt"]["id"]
        self.complete_correctly(practice_id)
        self.assertEqual(
            self.client.get(f"/api/v1/attempts/{practice_id}/certificate/").status_code, 409
        )
        assignment = self.assignment_for(self.slug)
        assignment.assigned_by = self.learner
        assignment.save()
        _, assessed = self.start(self.slug)
        attempt_id = assessed.json()["attempt"]["id"]
        self.complete_correctly(attempt_id)
        certificate = self.client.get(f"/api/v1/attempts/{attempt_id}/certificate/").json()
        self.assertEqual(certificate["level"], "self_study")
        self.assertEqual(certificate["levelTitle"], "Practice completed")

    def test_a_certificate_stops_verifying_when_an_instructor_overturns_the_result(self):
        self.sign_in()
        _, started = self.start(self.slug)
        attempt_id = started.json()["attempt"]["id"]
        self.complete_correctly(attempt_id)
        code = self.client.get(f"/api/v1/attempts/{attempt_id}/certificate/").json()["code"]
        Attempt.objects.filter(pk=attempt_id).update(
            review_decision=Attempt.ReviewDecision.NOT_YET_COMPETENT
        )
        self.assertEqual(Client().get(f"/api/v1/certificates/verify/{code}/").status_code, 404)

    def test_someone_else_cannot_fetch_my_certificate(self):
        self.sign_in()
        _, started = self.start(self.slug)
        attempt_id = started.json()["attempt"]["id"]
        self.complete_correctly(attempt_id)
        self.sign_in(self.instructor)
        self.assertEqual(
            self.client.get(f"/api/v1/attempts/{attempt_id}/certificate/").status_code, 404
        )


class LiveClassBoardTests(SeededTestCase):
    def test_board_ranks_teams_by_safety_before_speed(self):
        lesson = Lesson.objects.get(slug="workshop-hazard-hunt")
        scenario = SimulationScenario.objects.get(lesson=lesson)
        careful = User.objects.create_user("careful", password=PASSWORD, first_name="Careful")
        LearnerProfile.objects.create(user=careful)
        SchoolMembership.objects.create(school=self.school, user=careful, role="learner")
        Enrollment.objects.create(cohort=self.cohort, learner=careful)
        Assignment.objects.create(
            lesson=lesson, scenario=scenario, learner=careful, assigned_by=self.instructor
        )
        since = timezone.now().isoformat()

        # The demo learner rushes and clicks a live cable hazard wrongly; the other is careful.
        self.sign_in()
        _, started = self.start("workshop-hazard-hunt")
        rushed = started.json()["attempt"]["id"]
        self.act(rushed, "spot_first_aid")
        self.act(rushed, "spot_oil_spill")

        self.sign_in(careful)
        assignment = Assignment.objects.get(learner=careful)
        steady = self.client.post(f"/api/v1/assignments/{assignment.pk}/start/").json()["attempt"][
            "id"
        ]
        self.act(steady, "spot_oil_spill")

        self.sign_in(self.instructor)
        board = self.client.get(
            "/api/v1/instructor/live/",
            {"cohort": self.cohort.pk, "lesson": lesson.pk, "teams": 2, "since": since},
        ).json()
        self.assertEqual(board["learners"], 2)
        self.assertEqual(board["started"], 2)
        self.assertEqual(len(board["teams"]), 2)
        first, second = board["teams"]
        self.assertEqual(first["members"][0]["name"], "Careful")
        self.assertEqual(first["mistakes"], 0)
        self.assertEqual(second["mistakes"], 1)
        self.assertEqual(second["members"][0]["name"], "Demo L.")

    def test_board_is_staff_only_and_scoped(self):
        lesson = Lesson.objects.get(slug="workshop-hazard-hunt")
        self.sign_in()
        params = {"cohort": self.cohort.pk, "lesson": lesson.pk}
        self.assertEqual(self.client.get("/api/v1/instructor/live/", params).status_code, 403)
        other = School.objects.create(name="Other School", code="other-school")
        outsider = User.objects.create_user("outsider@opedu.local", password=PASSWORD)
        SchoolMembership.objects.create(school=other, user=outsider, role="instructor")
        self.sign_in(outsider)
        self.assertEqual(self.client.get("/api/v1/instructor/live/", params).status_code, 404)


class SecondTradeTests(SeededTestCase):
    slug = "safe-isolation-prove-dead"

    def test_electrical_course_is_its_own_trade_in_the_catalogue(self):
        self.sign_in()
        trades = {item["trade"] for item in self.client.get("/api/v1/catalogue/").json()["lessons"]}
        self.assertIn("Electrical Installation", trades)
        self.assertIn("Automobile Technology", trades)
        course = Course.objects.get(slug="electrical-installation-foundations")
        self.assertEqual(course.program.name, "Electrical Installation")

    def test_a_mislabelled_board_must_be_caught_by_testing(self):
        self.sign_in()
        _, response = self.start(self.slug)
        attempt = Attempt.objects.get(pk=response.json()["attempt"]["id"])
        attempt.variant_code = "mislabelled"
        attempt.save(update_fields=["variant_code"])
        early = self.act(attempt.pk, "select_breaker_b3")
        self.assertTrue(early.json()["correct"])
        self.act(attempt.pk, "switch_breaker_off")
        unlocked = self.act(attempt.pk, "test_socket").json()
        self.assertEqual(unlocked["consequence"]["effect"], "hazard")
        for action in ("apply_lock", "prove_tester_before", "test_socket", "prove_tester_after"):
            self.assertTrue(self.act(attempt.pk, action).json()["correct"], action)
        fatal = self.act(attempt.pk, "declare_dead").json()
        self.assertFalse(fatal["correct"])
        self.assertEqual(fatal["consequence"]["effect"], "spark")
        self.assertIn("230 V", fatal["message"])
        self.assertTrue(self.act(attempt.pk, "declare_live_stop").json()["correct"])


class ScenarioAuthoringChecksTests(TestCase):
    def test_scene_and_distractor_problems_block_publication(self):
        from .scenario_runtime import validate_runtime_extensions

        definition = {
            "steps": [
                {
                    "code": "a",
                    "action_code": "do_a",
                    "acceptable_actions": [{"action_code": "do_a"}],
                }
            ],
            "distractors": [{"action_code": "do_a", "label": "Also A"}],
            "scene": {
                "props": [
                    {"id": "meter", "kind": "multimeter", "position": [0, 0]},
                    {"id": "meter", "kind": "battery", "position": [1]},
                ],
                "bindings": {
                    "ghost.body": {"action": "do_a"},
                    "meter.display": {"accepts": {"probe": "do_a"}},
                },
                "effects": [{"when": "do_a", "set": {"nowhere": {"on": True}}}],
            },
        }
        errors = " ".join(validate_runtime_extensions(definition))
        for expected in (
            "also a correct action",
            "ids must be unique",
            "position of two numbers",
            "'ghost.body' refers to a prop",
            "no part gives that tool",
            "changes 'nowhere'",
        ):
            self.assertIn(expected, errors)


class LanguageTests(SeededTestCase):
    def test_learner_saves_a_language_that_follows_them(self):
        self.sign_in()
        saved = self.client.post(
            "/api/v1/auth/preferences/",
            {"preferredLanguage": "sw"},
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["user"]["preferredLanguage"], "sw")
        other_device = Client()
        other_device.force_login(self.learner)
        self.assertEqual(
            other_device.get("/api/v1/auth/me/").json()["user"]["preferredLanguage"], "sw"
        )
        bad = self.client.post(
            "/api/v1/auth/preferences/",
            {"preferredLanguage": "de"},
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)

    def test_lessons_can_be_written_in_french_and_swahili(self):
        lesson = Lesson.objects.get(slug="workshop-hazard-hunt")
        self.assertIn("fr", Lesson.Language.values)
        self.assertIn("sw", Lesson.Language.values)
        self.assertEqual(LearnerProfile.Language("fr").label, "French")
        self.assertEqual(lesson.language, "en")
