import hashlib
import json
from datetime import UTC, datetime

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from lab.access import generate_join_code, open_school
from lab.demo_content import (
    AUTO_COMPETENCIES,
    AUTO_LESSONS,
    BATTERY_LESSON,
    ELECTRICAL_COURSE,
    HAZARD_LESSON,
    SAFETY_COURSE,
    apply_overlays,
)
from lab.models import (
    AcceptableAction,
    AssetPackage,
    Assignment,
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
    ProcedureStep,
    Program,
    School,
    SchoolMembership,
    SimulationScenario,
    StepFeedback,
    StepHint,
    StepTolerance,
    Tool,
)
from lab.scenario_snapshots import build_scenario_definition


class Command(BaseCommand):
    help = "Create idempotent development data for the first OPedu learning workflow."

    def add_arguments(self, parser):
        parser.add_argument("--learner-email", default="learner@opedu.local")
        parser.add_argument("--instructor-email", default="instructor@opedu.local")
        parser.add_argument("--admin-email", default="admin@opedu.local")
        parser.add_argument("--password", default="LearnWithOPedu123!")
        parser.add_argument(
            "--content-only",
            action="store_true",
            help=(
                "Load the published lessons into the open class without creating demonstration "
                "accounts, classes or assignments. Safe to run on production on every deploy."
            ),
        )

    def handle(self, *args, **options):
        if options["content_only"]:
            school = open_school()
            administrator = self._curriculum_author()
            self._load_content(school, administrator, learner=None, instructor=None)
            self.stdout.write(self.style.SUCCESS("Published lessons are ready."))
            return

        user_model = get_user_model()
        password = options["password"]

        instructor, _ = user_model.objects.get_or_create(
            username=options["instructor_email"],
            defaults={
                "email": options["instructor_email"],
                "first_name": "Demo",
                "last_name": "Instructor",
                "is_staff": True,
            },
        )
        learner, _ = user_model.objects.get_or_create(
            username=options["learner_email"],
            defaults={
                "email": options["learner_email"],
                "first_name": "Demo",
                "last_name": "Learner",
            },
        )
        administrator, _ = user_model.objects.get_or_create(
            username=options["admin_email"],
            defaults={
                "email": options["admin_email"],
                "first_name": "Demo",
                "last_name": "Administrator",
                "is_staff": True,
            },
        )
        instructor.set_password(password)
        learner.set_password(password)
        administrator.set_password(password)
        instructor.save()
        learner.save()
        administrator.save()

        school, _ = School.objects.get_or_create(
            code="kigali-demo-tss",
            defaults={"name": "Kigali Demo Technical School"},
        )
        # The demonstration school takes part in the pilot study, so it shows the research tools.
        if not school.research_enabled:
            school.research_enabled = True
            school.save(update_fields=["research_enabled"])
        open_school()
        SchoolMembership.objects.update_or_create(
            school=school,
            user=instructor,
            defaults={"role": SchoolMembership.Role.INSTRUCTOR, "is_active": True},
        )
        SchoolMembership.objects.update_or_create(
            school=school,
            user=administrator,
            defaults={"role": SchoolMembership.Role.ADMIN, "is_active": True},
        )
        SchoolMembership.objects.update_or_create(
            school=school,
            user=learner,
            defaults={"role": SchoolMembership.Role.LEARNER, "is_active": True},
        )
        InstructorProfile.objects.update_or_create(
            user=instructor,
            defaults={"employee_id": "DEMO-INSTRUCTOR", "qualifications": ["Automotive"]},
        )
        LearnerProfile.objects.update_or_create(
            user=learner,
            defaults={"student_id": "DEMO-LEARNER"},
        )

        assignment = self._load_content(
            school, administrator, learner=learner, instructor=instructor
        )
        cohort = Cohort.objects.get(school=school, code="auto-2026")

        self.stdout.write(self.style.SUCCESS("Demo learning workflow is ready."))
        self.stdout.write(f"Class join code: {cohort.join_code}")
        self.stdout.write(f"Learner: {learner.email}")
        self.stdout.write(f"Instructor: {instructor.email}")
        self.stdout.write(f"Administrator: {administrator.email}")
        self.stdout.write(f"Assignment ID: {assignment.pk}")

    def _curriculum_author(self):
        """The account published lessons are credited to when no person seeded them.

        It cannot sign in: it has no usable password and is inactive.
        """

        author, created = get_user_model().objects.get_or_create(
            username="opedu-curriculum",
            defaults={"first_name": "OPedu", "last_name": "Curriculum", "is_active": False},
        )
        if created:
            author.set_unusable_password()
            author.save(update_fields=["password"])
        return author

    def _load_content(self, school, administrator, *, learner, instructor):
        """Courses, lessons and published practicals. Assigns them only when given a learner."""

        program, _ = Program.objects.update_or_create(
            school=school,
            code="automobile-technology",
            defaults={
                "name": "Automobile Technology",
                "description": "Automotive service, electrical diagnosis, and workshop safety.",
                "is_active": True,
            },
        )
        if learner is not None:
            cohort, _ = Cohort.objects.update_or_create(
                school=school,
                code="auto-2026",
                defaults={
                    "program": program,
                    "name": "Automobile Technology 2026",
                    "academic_year": "2026",
                    "is_active": True,
                },
            )
            Enrollment.objects.update_or_create(
                cohort=cohort,
                learner=learner,
                defaults={"status": Enrollment.Status.ACTIVE},
            )
            if not cohort.join_code:
                cohort.join_code = generate_join_code()
                cohort.save()

        course, _ = Course.objects.update_or_create(
            slug="automotive-electrical-foundations",
            defaults={
                "school": school,
                "program": program,
                "title": "Automotive Electrical Foundations",
                "trade": "Automobile Technology",
                "description": "Safe, structured introduction to automotive electrical diagnosis.",
                "is_published": True,
                # Listed in the open catalogue so anyone can try the demonstration lessons.
                "open_enrollment": True,
            },
        )
        module, _ = Module.objects.update_or_create(
            course=course,
            code="battery-electrical-diagnosis",
            defaults={
                "title": "Battery and Electrical Diagnosis",
                "description": "Safe preparation, measurement, and diagnosis procedures.",
                "order": 1,
                "is_published": True,
            },
        )
        safety, _ = Competency.objects.update_or_create(
            course=course,
            code="AUTO-SAFE-01",
            defaults={
                "title": "Prepare the vehicle electrical system safely",
                "description": "Identify hazards and isolate electrical energy before inspection.",
                "curriculum_reference": "AUTO-ELEC-SAFE-01",
                "level": 1,
                "evidence_rules": [
                    {"event": "step_completed", "stepCode": "ppe", "required": True},
                    {"event": "step_completed", "stepCode": "ignition", "required": True},
                ],
                "mastery_criteria": ["Completes every safety-critical preparation step in order."],
                "mastery_threshold": 100,
            },
        )
        diagnosis, _ = Competency.objects.update_or_create(
            course=course,
            code="AUTO-DIAG-01",
            defaults={
                "title": "Perform a structured battery diagnosis",
                "description": "Select the correct instrument settings and interpret measurements.",
                "curriculum_reference": "AUTO-ELEC-DIAG-01",
                "level": 1,
                "evidence_rules": [
                    {"event": "step_completed", "stepCode": "diagnosis", "required": True}
                ],
                "mastery_criteria": [
                    "Uses the correct meter mode and interprets the stabilized voltage."
                ],
                "mastery_threshold": 80,
            },
        )
        lesson, _ = Lesson.objects.update_or_create(
            course=course,
            slug="battery-inspection-and-diagnosis",
            defaults={
                "module": module,
                "authored_by": administrator,
                "reviewed_by": administrator,
                "title": "Battery Inspection and Diagnosis",
                "summary": "Prepare, inspect, and diagnose a vehicle battery using a safe sequence.",
                "objectives": [
                    "Identify battery and electrical hazards.",
                    "Select the correct multimeter mode and range.",
                    "Interpret voltage readings and choose the next diagnostic action.",
                ],
                "safety_notes": [
                    "Wear eye protection and remove conductive jewellery.",
                    "Confirm ignition is off before connecting test equipment.",
                ],
                "estimated_minutes": 25,
                "language": Lesson.Language.ENGLISH,
                "content_version": 1,
                "status": Lesson.Status.PUBLISHED,
                "submitted_at": datetime(2026, 1, 5, tzinfo=UTC),
                "reviewed_at": datetime(2026, 1, 7, tzinfo=UTC),
                "published_at": datetime(2026, 1, 10, tzinfo=UTC),
            },
        )
        lesson.competencies.set([safety, diagnosis])
        procedure = [
            {
                "order": 1,
                "code": "ppe",
                "title": "Put on eye protection",
                "instruction": "Select the safety glasses before approaching the battery.",
                "action_code": "confirm_ppe",
                "feedback": "Eye protection confirmed. You can now make the vehicle safe.",
                "safety_critical": True,
            },
            {
                "order": 2,
                "code": "ignition",
                "title": "Switch the ignition off",
                "instruction": "Turn the ignition switch to OFF before connecting test equipment.",
                "action_code": "turn_ignition_off",
                "feedback": "Ignition isolated. The circuit is ready for a controlled measurement.",
                "safety_critical": True,
            },
            {
                "order": 3,
                "code": "meter-mode",
                "title": "Set the multimeter",
                "instruction": "Set the multimeter to DC voltage for a 12 V vehicle battery.",
                "action_code": "set_meter_dc",
                "feedback": "DC voltage mode selected.",
                "safety_critical": False,
            },
            {
                "order": 4,
                "code": "negative-lead",
                "title": "Connect the black lead",
                "instruction": "Connect the black probe to the negative battery terminal.",
                "action_code": "connect_black_negative",
                "feedback": "The common lead is connected to the negative terminal.",
                "safety_critical": False,
            },
            {
                "order": 5,
                "code": "positive-lead",
                "title": "Connect the red lead",
                "instruction": "Connect the red probe to the positive battery terminal.",
                "action_code": "connect_red_positive",
                "feedback": "Both probes are connected with correct polarity.",
                "safety_critical": False,
            },
            {
                "order": 6,
                "code": "read-voltage",
                "title": "Read the voltage",
                "instruction": "Read and record the stabilized open-circuit voltage.",
                "action_code": "read_voltage",
                "feedback": "The meter reads 12.6 V, consistent with a charged battery at rest.",
                "safety_critical": False,
                "metadata": {"reading": 12.6, "unit": "V"},
            },
            {
                "order": 7,
                "code": "diagnosis",
                "title": "Choose the diagnosis",
                "instruction": "Use the 12.6 V reading to decide the battery condition.",
                "action_code": "choose_serviceable",
                "feedback": "Correct: 12.6 V indicates a charged, serviceable battery for this scenario.",
                "safety_critical": False,
            },
        ]
        steps = {}
        for step_data in procedure:
            step, _ = ProcedureStep.objects.update_or_create(
                lesson=lesson,
                code=step_data["code"],
                defaults=step_data,
            )
            steps[step.code] = step
        safety_glasses, _ = Tool.objects.update_or_create(
            course=course,
            code="safety-glasses",
            defaults={
                "name": "Safety glasses",
                "description": "Impact-rated eye protection for battery work.",
            },
        )
        multimeter, _ = Tool.objects.update_or_create(
            course=course,
            code="digital-multimeter",
            defaults={
                "name": "Digital multimeter",
                "description": "CAT-rated meter configured for DC voltage measurement.",
            },
        )
        eye_hazard, _ = Hazard.objects.update_or_create(
            course=course,
            code="battery-eye-exposure",
            defaults={
                "title": "Battery material eye exposure",
                "description": "Battery material or fragments can injure unprotected eyes.",
                "mitigation": "Wear eye protection before approaching the battery.",
                "severity": Hazard.Severity.HIGH,
            },
        )
        electrical_hazard, _ = Hazard.objects.update_or_create(
            course=course,
            code="energized-electrical-circuit",
            defaults={
                "title": "Energized electrical circuit",
                "description": "Incorrect isolation or probe placement can cause a short circuit.",
                "mitigation": "Switch ignition off and connect probes in the defined sequence.",
                "severity": Hazard.Severity.CRITICAL,
            },
        )
        steps["ppe"].required_tools.set([safety_glasses])
        steps["ppe"].hazards.set([eye_hazard])
        steps["ppe"].competencies.set([safety])
        steps["ignition"].hazards.set([electrical_hazard])
        steps["ignition"].competencies.set([safety])
        for code in ["meter-mode", "negative-lead", "positive-lead", "read-voltage"]:
            steps[code].required_tools.set([multimeter])
            steps[code].hazards.set([electrical_hazard])
            steps[code].competencies.set([diagnosis])
        steps["diagnosis"].competencies.set([diagnosis])

        voltage_tolerance, _ = StepTolerance.objects.update_or_create(
            step=steps["read-voltage"],
            code="charged-battery-voltage",
            defaults={
                "measurement": "Open-circuit battery voltage",
                "minimum_value": "12.4000",
                "maximum_value": "12.8000",
                "unit": "V",
            },
        )
        for step in steps.values():
            AcceptableAction.objects.update_or_create(
                step=step,
                action_code=step.action_code,
                defaults={
                    "label": step.title,
                    "is_primary": True,
                    "tolerance": voltage_tolerance if step.code == "read-voltage" else None,
                },
            )
            StepFeedback.objects.update_or_create(
                step=step,
                outcome=StepFeedback.Outcome.CORRECT,
                defaults={"message": step.feedback},
            )
            StepFeedback.objects.update_or_create(
                step=step,
                outcome=StepFeedback.Outcome.SAFETY
                if step.safety_critical
                else StepFeedback.Outcome.INCORRECT,
                defaults={
                    "message": "Restore the safe sequence before continuing."
                    if step.safety_critical
                    else "Review the current instruction and try again."
                },
            )
        StepFeedback.objects.update_or_create(
            step=steps["read-voltage"],
            outcome=StepFeedback.Outcome.TOLERANCE,
            defaults={"message": "The reading must be between 12.4 V and 12.8 V."},
        )
        StepHint.objects.update_or_create(
            step=steps["meter-mode"],
            code="look-for-dc-symbol",
            defaults={
                "order": 1,
                "text": "Choose the meter setting marked with a solid line over a dashed line.",
                "points_penalty": 2,
            },
        )
        StepHint.objects.update_or_create(
            step=steps["diagnosis"],
            code="charged-resting-range",
            defaults={
                "order": 1,
                "text": "A charged 12 V battery at rest is close to 12.6 V.",
                "points_penalty": 2,
            },
        )
        grading_policy, _ = GradingPolicy.objects.update_or_create(
            code="standard-deterministic",
            version=1,
            defaults={
                "name": "Standard deterministic practical assessment",
                "algorithm": GradingPolicy.BASE_MINUS_EVENT_PENALTIES_V1,
                "base_score": 100,
                "pass_threshold": 80,
                "incorrect_action_penalty": 5,
                "safety_critical_penalty": 15,
                "requires_review_on_safety_error": False,
                "rules": {
                    "algorithm": "base-minus-event-penalties",
                    "minimumScore": 0,
                },
                "status": GradingPolicy.Status.PUBLISHED,
                "published_at": datetime(2026, 1, 8, tzinfo=UTC),
            },
        )
        asset_manifest = {
            "format": "opedu-asset-package/v2",
            "schemaVersion": "2",
            "curriculumOwner": school.name,
            "license": "LicenseRef-OPedu-Prototype",
            "renderer": "procedural-r3f",
            "files": [],
            "licenseStatus": "prototype-generated-geometry",
            "qualityTiers": {
                "low": {
                    "maximumBytes": 2_000_000,
                    "maximumTextureDimension": 1024,
                    "maximumTriangles": 50_000,
                    "maximumDrawCalls": 40,
                    "maximumMaterials": 16,
                },
                "medium": {
                    "maximumBytes": 5_000_000,
                    "maximumTextureDimension": 2048,
                    "maximumTriangles": 100_000,
                    "maximumDrawCalls": 70,
                    "maximumMaterials": 24,
                },
                "high": {
                    "maximumBytes": 12_000_000,
                    "maximumTextureDimension": 2048,
                    "maximumTriangles": 180_000,
                    "maximumDrawCalls": 100,
                    "maximumMaterials": 32,
                },
            },
            "productionReplacementRequired": True,
        }
        # Create-only: a published package is immutable, so re-seeding an older database keeps
        # the manifest it was published with.
        asset_package, _ = AssetPackage.objects.get_or_create(
            course=course,
            code="battery-workshop",
            version=1,
            defaults={
                "name": "Battery workshop procedural assets",
                "manifest": asset_manifest,
                "sha256": hashlib.sha256(
                    json.dumps(asset_manifest, sort_keys=True).encode("utf-8")
                ).hexdigest(),
                "total_byte_size": 0,
                "status": AssetPackage.Status.PUBLISHED,
                "published_at": datetime(2026, 1, 9, tzinfo=UTC),
            },
        )
        scenario_definition = build_scenario_definition(lesson)
        scenario, _ = SimulationScenario.objects.update_or_create(
            lesson=lesson,
            version=1,
            defaults={
                "title": "Battery Inspection and Diagnosis — guided scenario",
                "definition": scenario_definition,
                "grading_policy": grading_policy,
                "asset_package": asset_package,
                "status": SimulationScenario.Status.PUBLISHED,
                "published_at": datetime(2026, 1, 10, tzinfo=UTC),
            },
        )
        # Version 2 of the battery practical adds options, consequences, fault cases, a marked
        # knowledge check and the data-driven scene. Version 1 stays as published for anyone
        # already part-way through it.
        battery_v2 = self._publish_scenario(
            lesson,
            BATTERY_LESSON,
            grading_policy=grading_policy,
            asset_package=asset_package,
            author=administrator,
        )
        assignment = None
        if learner is not None:
            assignment, _ = Assignment.objects.get_or_create(
                scenario=battery_v2,
                learner=learner,
                defaults={"lesson": lesson, "assigned_by": instructor},
            )

        for code, values in AUTO_COMPETENCIES.items():
            Competency.objects.update_or_create(
                course=course,
                code=code,
                defaults={**values, "level": 1, "mastery_criteria": [values["description"]]},
            )
        for spec in AUTO_LESSONS:
            self._seed_lesson(
                course,
                module,
                spec,
                grading_policy=grading_policy,
                asset_package=asset_package,
                author=administrator,
                learner=learner,
                instructor=instructor,
            )

        safety_course, _ = Course.objects.update_or_create(
            slug=SAFETY_COURSE["slug"],
            defaults={
                "school": school,
                "title": SAFETY_COURSE["title"],
                "trade": SAFETY_COURSE["trade"],
                "description": SAFETY_COURSE["description"],
                "is_published": True,
                "open_enrollment": True,
            },
        )
        safety_module, _ = Module.objects.update_or_create(
            course=safety_course,
            code=SAFETY_COURSE["module"]["code"],
            defaults={"title": SAFETY_COURSE["module"]["title"], "order": 1, "is_published": True},
        )
        for code, values in SAFETY_COURSE["competencies"].items():
            Competency.objects.update_or_create(
                course=safety_course,
                code=code,
                defaults={**values, "level": 1, "mastery_criteria": [values["description"]]},
            )
        safety_manifest = {**asset_manifest, "curriculumOwner": school.name}
        safety_package, _ = AssetPackage.objects.get_or_create(
            course=safety_course,
            code="workshop-floor",
            version=1,
            defaults={
                "name": "Workshop floor procedural assets",
                "manifest": safety_manifest,
                "sha256": hashlib.sha256(
                    json.dumps(safety_manifest, sort_keys=True).encode("utf-8")
                ).hexdigest(),
                "total_byte_size": 0,
                "status": AssetPackage.Status.PUBLISHED,
                "published_at": datetime(2026, 1, 9, tzinfo=UTC),
            },
        )
        self._seed_lesson(
            safety_course,
            safety_module,
            HAZARD_LESSON,
            grading_policy=grading_policy,
            asset_package=safety_package,
            author=administrator,
            learner=learner,
            instructor=instructor,
        )

        self._seed_course(
            school,
            ELECTRICAL_COURSE,
            manifest=asset_manifest,
            grading_policy=grading_policy,
            author=administrator,
            learner=learner,
            instructor=instructor,
        )

        return assignment

    def _publish_scenario(self, lesson, spec, *, grading_policy, asset_package, author):
        """Publish a lesson's practical from its authoring rows plus the spec's extras.

        Create-only: a published scenario is immutable, so re-seeding keeps what an existing
        database already published under this version number.
        """

        existing = SimulationScenario.objects.filter(
            lesson=lesson, version=spec["scenario_version"]
        ).first()
        if existing is not None:
            return existing
        return SimulationScenario.objects.create(
            lesson=lesson,
            version=spec["scenario_version"],
            title=spec["scenario_title"],
            definition=apply_overlays(build_scenario_definition(lesson), spec),
            grading_policy=grading_policy,
            asset_package=asset_package,
            status=SimulationScenario.Status.PUBLISHED,
            authored_by=author,
            published_at=datetime(2026, 1, 10, tzinfo=UTC),
        )

    def _seed_lesson(
        self,
        course,
        module,
        spec,
        *,
        grading_policy,
        asset_package,
        author,
        learner,
        instructor,
    ):
        lesson = Lesson.objects.filter(course=course, slug=spec["slug"]).first()
        if lesson is None:
            lesson = Lesson.objects.create(
                course=course,
                module=module,
                slug=spec["slug"],
                title=spec["title"],
                summary=spec["summary"],
                objectives=spec["objectives"],
                safety_notes=spec["safety_notes"],
                estimated_minutes=spec["estimated_minutes"],
                language=Lesson.Language.ENGLISH,
                content_version=1,
                authored_by=author,
                reviewed_by=author,
                status=Lesson.Status.PUBLISHED,
                submitted_at=datetime(2026, 1, 5, tzinfo=UTC),
                reviewed_at=datetime(2026, 1, 7, tzinfo=UTC),
                published_at=datetime(2026, 1, 10, tzinfo=UTC),
            )
        competencies = {
            item.code: item
            for item in Competency.objects.filter(course=course, code__in=spec["competencies"])
        }
        lesson.competencies.set(competencies.values())
        for authored in spec["steps"]:
            step, _ = ProcedureStep.objects.update_or_create(
                lesson=lesson,
                code=authored["code"],
                defaults={
                    "order": authored["order"],
                    "title": authored["title"],
                    "instruction": authored["instruction"],
                    "action_code": authored["action_code"],
                    "feedback": authored["feedback"],
                    "safety_critical": authored["safety_critical"],
                    "metadata": authored.get("metadata", {}),
                },
            )
            step.competencies.set(
                [competencies[code] for code in authored.get("competency_codes", [])]
            )
            AcceptableAction.objects.update_or_create(
                step=step,
                action_code=step.action_code,
                defaults={"label": step.title, "is_primary": True},
            )
            StepFeedback.objects.update_or_create(
                step=step,
                outcome=StepFeedback.Outcome.CORRECT,
                defaults={"message": step.feedback},
            )
            for index, hint in enumerate(authored.get("hints", []), start=1):
                StepHint.objects.update_or_create(
                    step=step,
                    code=hint["code"],
                    defaults={
                        "order": index,
                        "text": hint["text"],
                        "points_penalty": hint.get("points_penalty", 0),
                    },
                )
        scenario = self._publish_scenario(
            lesson, spec, grading_policy=grading_policy, asset_package=asset_package, author=author
        )
        if learner is not None:
            Assignment.objects.get_or_create(
                scenario=scenario,
                learner=learner,
                defaults={"lesson": lesson, "assigned_by": instructor},
            )
        return scenario

    def _seed_course(self, school, spec, *, manifest, grading_policy, author, learner, instructor):
        """A whole course from data: program, module, competencies, assets and lessons."""

        program, _ = Program.objects.update_or_create(
            school=school,
            code=spec["program"]["code"],
            defaults={"name": spec["program"]["name"], "is_active": True},
        )
        course, _ = Course.objects.update_or_create(
            slug=spec["slug"],
            defaults={
                "school": school,
                "program": program,
                "title": spec["title"],
                "trade": spec["trade"],
                "description": spec["description"],
                "is_published": True,
                "open_enrollment": True,
            },
        )
        module, _ = Module.objects.update_or_create(
            course=course,
            code=spec["module"]["code"],
            defaults={"title": spec["module"]["title"], "order": 1, "is_published": True},
        )
        for code, values in spec["competencies"].items():
            Competency.objects.update_or_create(
                course=course,
                code=code,
                defaults={**values, "level": 1, "mastery_criteria": [values["description"]]},
            )
        course_manifest = {**manifest, "curriculumOwner": school.name}
        package, _ = AssetPackage.objects.get_or_create(
            course=course,
            code=f"{spec['slug']}-procedural",
            version=1,
            defaults={
                "name": f"{spec['title']} procedural assets",
                "manifest": course_manifest,
                "sha256": hashlib.sha256(
                    json.dumps(course_manifest, sort_keys=True).encode("utf-8")
                ).hexdigest(),
                "total_byte_size": 0,
                "status": AssetPackage.Status.PUBLISHED,
                "published_at": datetime(2026, 1, 9, tzinfo=UTC),
            },
        )
        for lesson_spec in spec["lessons"]:
            self._seed_lesson(
                course,
                module,
                lesson_spec,
                grading_policy=grading_policy,
                asset_package=package,
                author=author,
                learner=learner,
                instructor=instructor,
            )
