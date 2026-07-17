from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from lab.models import (
    Assignment,
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
    SchoolMembership,
)


class Command(BaseCommand):
    help = "Create idempotent development data for the first OPedu learning workflow."

    def add_arguments(self, parser):
        parser.add_argument("--learner-email", default="learner@opedu.local")
        parser.add_argument("--instructor-email", default="instructor@opedu.local")
        parser.add_argument("--admin-email", default="admin@opedu.local")
        parser.add_argument("--password", default="LearnWithOPedu123!")

    def handle(self, *args, **options):
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
            code="rubavu-demo-tss",
            defaults={"name": "Rubavu Demo Technical School"},
        )
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

        program, _ = Program.objects.update_or_create(
            school=school,
            code="automobile-technology",
            defaults={
                "name": "Automobile Technology",
                "description": "Automotive service, electrical diagnosis, and workshop safety.",
                "is_active": True,
            },
        )
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

        course, _ = Course.objects.update_or_create(
            slug="automotive-electrical-foundations",
            defaults={
                "school": school,
                "program": program,
                "title": "Automotive Electrical Foundations",
                "trade": "Automobile Technology",
                "description": "Safe, structured introduction to automotive electrical diagnosis.",
                "is_published": True,
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
                "mastery_threshold": 100,
            },
        )
        diagnosis, _ = Competency.objects.update_or_create(
            course=course,
            code="AUTO-DIAG-01",
            defaults={
                "title": "Perform a structured battery diagnosis",
                "description": "Select the correct instrument settings and interpret measurements.",
                "mastery_threshold": 80,
            },
        )
        lesson, _ = Lesson.objects.update_or_create(
            course=course,
            slug="battery-inspection-and-diagnosis",
            defaults={
                "module": module,
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
                "status": Lesson.Status.PUBLISHED,
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
        for step_data in procedure:
            ProcedureStep.objects.update_or_create(
                lesson=lesson,
                code=step_data["code"],
                defaults=step_data,
            )
        assignment, _ = Assignment.objects.get_or_create(
            lesson=lesson,
            learner=learner,
            defaults={"assigned_by": instructor},
        )

        self.stdout.write(self.style.SUCCESS("Demo learning workflow is ready."))
        self.stdout.write(f"Learner: {learner.email}")
        self.stdout.write(f"Instructor: {instructor.email}")
        self.stdout.write(f"Administrator: {administrator.email}")
        self.stdout.write(f"Assignment ID: {assignment.pk}")
