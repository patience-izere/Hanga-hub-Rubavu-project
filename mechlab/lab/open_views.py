"""The open catalogue, the visitor demo, certificates, and the live class board."""

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .learning_serializers import (
    LessonSummarySerializer,
    SimulationScenarioSummarySerializer,
)
from .models import (
    Assignment,
    Attempt,
    Cohort,
    Course,
    Enrollment,
    Lesson,
    SimulationScenario,
)
from .permissions import IsInstructorOrSchoolAdmin
from .scenario_runtime import choose_variant, resolved_steps

CERTIFICATE_SALT = "opedu.certificate.v1"
OPEN_ATTEMPT_LIMIT = 20
MISTAKE_EVENT_TYPES = ("incorrect_action", "tolerance_failed")
PASSING_OUTCOMES = (Attempt.Outcome.PASSED, Attempt.Outcome.MASTERED)


def _open_scenarios():
    """The newest published practical of every lesson in an openly enrollable course."""

    scenarios = (
        SimulationScenario.objects.filter(
            status=SimulationScenario.Status.PUBLISHED,
            lesson__status=Lesson.Status.PUBLISHED,
            lesson__course__open_enrollment=True,
            lesson__course__is_published=True,
        )
        .select_related(
            "lesson", "lesson__course", "lesson__course__school", "lesson__module", "grading_policy"
        )
        .order_by("lesson__course__title", "lesson__module__order", "lesson__title", "-version")
    )
    latest = {}
    for scenario in scenarios:
        latest.setdefault(scenario.lesson_id, scenario)
    return list(latest.values())


class CatalogueView(APIView):
    """Lessons anyone signed in can add to their own learning."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        scenarios = _open_scenarios()
        mine = {
            assignment.lesson_id: assignment
            for assignment in Assignment.objects.filter(
                learner=request.user, lesson_id__in=[item.lesson_id for item in scenarios]
            ).order_by("created_at")
        }
        return Response(
            {
                "lessons": [
                    {
                        "lessonId": scenario.lesson_id,
                        "title": scenario.lesson.title,
                        "summary": scenario.lesson.summary,
                        "estimatedMinutes": scenario.lesson.estimated_minutes,
                        "language": scenario.lesson.language,
                        "trade": scenario.lesson.course.trade,
                        "courseTitle": scenario.lesson.course.title,
                        "provider": scenario.lesson.course.school.name
                        if scenario.lesson.course.school_id
                        else "OPedu",
                        "stepCount": len(scenario.definition.get("steps", [])),
                        "assignmentId": mine[scenario.lesson_id].pk
                        if scenario.lesson_id in mine
                        else None,
                    }
                    for scenario in scenarios
                ]
            }
        )


class CatalogueEnrollView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT})
    def post(self, request, lesson_id):
        scenario = next((item for item in _open_scenarios() if item.lesson_id == lesson_id), None)
        if scenario is None:
            return Response(
                {"detail": "This lesson is not in the open catalogue."},
                status=status.HTTP_404_NOT_FOUND,
            )
        with transaction.atomic():
            existing = (
                Assignment.objects.select_for_update()
                .filter(learner=request.user, lesson=scenario.lesson)
                .order_by("-created_at")
                .first()
            )
            if existing is not None and existing.scenario_id == scenario.pk:
                return Response({"assignmentId": existing.pk})
            assignment = Assignment.objects.create(
                lesson=scenario.lesson,
                scenario=scenario,
                learner=request.user,
                # Self-enrolment: nobody assigned it, which is what the certificate later says.
                assigned_by=request.user,
                attempt_limit=OPEN_ATTEMPT_LIMIT,
            )
            record_audit_event(
                event_type="learning.self_enrolled",
                actor=request.user,
                school=scenario.lesson.course.school,
                target=assignment,
                payload={"lessonId": scenario.lesson_id, "scenarioVersion": scenario.version},
            )
        return Response({"assignmentId": assignment.pk}, status=status.HTTP_201_CREATED)


class DemoLessonView(APIView):
    """One published lesson a visitor can try without an account. Nothing is recorded."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        scenario = next(
            (item for item in _open_scenarios() if item.lesson.slug == settings.DEMO_LESSON_SLUG),
            None,
        )
        if scenario is None:
            return Response(
                {"detail": "No demonstration lesson is published yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        variant_code = choose_variant(scenario.definition)
        lesson = LessonSummarySerializer(
            scenario.lesson, context={"scenario": scenario, "variant_code": variant_code}
        ).data
        return Response(
            {
                "lesson": lesson,
                "scenario": SimulationScenarioSummarySerializer(scenario).data,
            }
        )


def certificate_level(attempt):
    """How much a certificate may claim. Returns ``None`` when the attempt earns none."""

    if attempt.is_practice or attempt.status not in (
        Attempt.Status.COMPLETED,
        Attempt.Status.REQUIRES_REVIEW,
    ):
        return None
    if attempt.review_decision == Attempt.ReviewDecision.COMPETENT:
        return "instructor_confirmed"
    if attempt.review_decision == Attempt.ReviewDecision.NOT_YET_COMPETENT:
        return None
    if attempt.status != Attempt.Status.COMPLETED or attempt.outcome not in PASSING_OUTCOMES:
        return None
    if attempt.assignment.assigned_by_id == attempt.learner_id:
        return "self_study"
    return "simulation_passed"


CERTIFICATE_STATEMENTS = {
    "self_study": (
        "Practice completed",
        "Completed this simulated practice independently. It records practice, not an "
        "assessment of workshop competence.",
    ),
    "simulation_passed": (
        "Simulation passed",
        "Passed this simulated procedure, assigned and automatically scored through their "
        "organisation. Workshop competence is confirmed only by a qualified instructor.",
    ),
    "instructor_confirmed": (
        "Instructor confirmed",
        "An instructor reviewed the recorded evidence for this simulated procedure and "
        "confirmed the result.",
    ),
}


def _certificate_payload(attempt, level):
    title, statement = CERTIFICATE_STATEMENTS[level]
    lesson = attempt.assignment.lesson
    reviewer = attempt.reviewed_by if level == "instructor_confirmed" else None
    return {
        "level": level,
        "levelTitle": title,
        "statement": statement,
        "learnerName": attempt.learner.get_full_name() or attempt.learner.get_username(),
        "lessonTitle": lesson.title,
        "courseTitle": lesson.course.title,
        "trade": lesson.course.trade,
        "organisation": lesson.course.school.name if lesson.course.school_id else "OPedu",
        "score": str(attempt.score) if attempt.score is not None else None,
        "completedAt": attempt.completed_at,
        "reviewerName": (reviewer.get_full_name() or reviewer.get_username()) if reviewer else "",
        "scenarioVersion": attempt.scenario.version,
    }


class AttemptCertificateView(APIView):
    """The learner's own certificate for one attempt, with a code anyone can check."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        attempt = (
            Attempt.objects.filter(pk=pk, learner=request.user)
            .select_related(
                "learner",
                "reviewed_by",
                "scenario",
                "assignment",
                "assignment__lesson",
                "assignment__lesson__course",
                "assignment__lesson__course__school",
            )
            .first()
        )
        if attempt is None:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        level = certificate_level(attempt)
        if level is None:
            return Response(
                {"detail": "This attempt has not earned a certificate.", "code": "not_earned"},
                status=status.HTTP_409_CONFLICT,
            )
        code = signing.dumps({"a": attempt.pk}, salt=CERTIFICATE_SALT, compress=True)
        return Response(
            {
                **_certificate_payload(attempt, level),
                "code": code,
                "verifyUrl": f"{settings.FRONTEND_URL}/verify/{code}",
            }
        )


class CertificateVerifyView(APIView):
    """Anyone holding a certificate's code can confirm it is genuine and still stands."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, code):
        invalid = Response(
            {"valid": False, "detail": "This certificate code is not valid."},
            status=status.HTTP_404_NOT_FOUND,
        )
        try:
            attempt_id = signing.loads(code, salt=CERTIFICATE_SALT)["a"]
        except (signing.BadSignature, KeyError, TypeError):
            return invalid
        attempt = (
            Attempt.objects.filter(pk=attempt_id)
            .select_related(
                "learner",
                "reviewed_by",
                "scenario",
                "assignment",
                "assignment__lesson",
                "assignment__lesson__course",
                "assignment__lesson__course__school",
            )
            .first()
        )
        level = certificate_level(attempt) if attempt is not None else None
        if level is None:
            # Covers a result an instructor later reviewed as not yet competent.
            return invalid
        return Response({"valid": True, **_certificate_payload(attempt, level)})


def _display_name(user):
    """First name and family initial: enough to recognise a classmate on a shared screen."""

    first = user.first_name or user.get_username()
    return f"{first} {user.last_name[:1]}." if user.last_name else first


class LiveClassBoardView(APIView):
    """A class working through one lesson together, for a projector.

    Teams are ranked by working safely first, then by progress and care, and only last by time,
    so the board rewards the habits the workshop needs rather than raw speed.
    """

    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(
        parameters=[
            OpenApiParameter("cohort", int, required=True),
            OpenApiParameter("lesson", int, required=True),
            OpenApiParameter("since", str, required=False),
            OpenApiParameter("teams", int, required=False),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        from .access_views import _staff_school_ids

        try:
            cohort_id = int(request.query_params.get("cohort", ""))
            lesson_id = int(request.query_params.get("lesson", ""))
            team_count = max(1, min(8, int(request.query_params.get("teams", "2"))))
        except ValueError:
            return Response(
                {"detail": "Choose a class and a lesson."}, status=status.HTTP_400_BAD_REQUEST
            )
        since = parse_datetime(request.query_params.get("since", "") or "")
        if since is not None and timezone.is_naive(since):
            since = timezone.make_aware(since)
        cohort = (
            Cohort.objects.filter(pk=cohort_id, school_id__in=_staff_school_ids(request.user))
            .select_related("school")
            .first()
        )
        lesson = Lesson.objects.filter(pk=lesson_id).select_related("course").first()
        if cohort is None or lesson is None:
            return Response(
                {"detail": "Class or lesson not found."}, status=status.HTTP_404_NOT_FOUND
            )
        enrollments = list(
            Enrollment.objects.filter(cohort=cohort, status=Enrollment.Status.ACTIVE)
            .select_related("learner")
            .order_by("learner_id")
        )
        learner_ids = [item.learner_id for item in enrollments]
        attempts = Attempt.objects.filter(
            learner_id__in=learner_ids, assignment__lesson=lesson
        ).select_related("scenario")
        if since is not None:
            attempts = attempts.filter(started_at__gte=since)
        latest = {}
        for attempt in attempts.prefetch_related("events").order_by("learner_id", "-started_at"):
            latest.setdefault(attempt.learner_id, attempt)

        members = []
        for index, enrollment in enumerate(enrollments):
            attempt = latest.get(enrollment.learner_id)
            total = (
                len(resolved_steps(attempt.scenario.definition, attempt.variant_code))
                if attempt
                else 0
            )
            mistakes = safety = 0
            if attempt:
                for event in attempt.events.all():
                    if event.event_type in MISTAKE_EVENT_TYPES:
                        mistakes += 1
                        safety += int(event.payload.get("safetyCritical") is True)
            finished = bool(
                attempt
                and attempt.status in (Attempt.Status.COMPLETED, Attempt.Status.REQUIRES_REVIEW)
            )
            done = len((attempt.resume_state or {}).get("completedSteps", [])) if attempt else 0
            members.append(
                {
                    "id": enrollment.learner_id,
                    "name": _display_name(enrollment.learner),
                    "team": index % team_count,
                    "started": attempt is not None,
                    "finished": finished,
                    "stepsCompleted": done,
                    "totalSteps": total,
                    "mistakes": mistakes,
                    "safetyErrors": safety,
                    "seconds": int((attempt.completed_at - attempt.started_at).total_seconds())
                    if finished and attempt.completed_at
                    else None,
                }
            )

        teams = []
        for number in range(team_count):
            team_members = [item for item in members if item["team"] == number]
            if not team_members:
                continue
            size = len(team_members)
            progress = sum(
                (item["stepsCompleted"] / item["totalSteps"]) if item["totalSteps"] else 0
                for item in team_members
            )
            times = [item["seconds"] for item in team_members if item["seconds"] is not None]
            teams.append(
                {
                    "number": number + 1,
                    "members": team_members,
                    "finished": sum(item["finished"] for item in team_members),
                    "size": size,
                    "progressPercent": round(progress / size * 100),
                    "safetyErrors": sum(item["safetyErrors"] for item in team_members),
                    "mistakes": sum(item["mistakes"] for item in team_members),
                    "averageSeconds": round(sum(times) / len(times)) if times else None,
                }
            )
        teams.sort(
            key=lambda team: (
                team["safetyErrors"] / team["size"],
                -team["progressPercent"],
                team["mistakes"] / team["size"],
                team["averageSeconds"] if team["averageSeconds"] is not None else float("inf"),
            )
        )
        for rank, team in enumerate(teams, start=1):
            team["rank"] = rank
        return Response(
            {
                "className": cohort.name,
                "lessonTitle": lesson.title,
                "joinCode": cohort.join_code or "",
                "teams": teams,
                "started": sum(item["started"] for item in members),
                "finished": sum(item["finished"] for item in members),
                "learners": len(members),
                "serverTime": timezone.now(),
            }
        )


class OpenStatusView(APIView):
    """What a signed-out visitor may do here, so the public pages offer only what works."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({"openRegistration": bool(settings.OPEN_REGISTRATION)})


def _public_courses():
    return (
        Course.objects.filter(is_published=True, school__is_active=True)
        .select_related("school")
        .prefetch_related("modules", "lessons")
        .order_by("title")
    )


def _published_lessons(course):
    return sorted(
        (lesson for lesson in course.lessons.all() if lesson.status == Lesson.Status.PUBLISHED),
        key=lambda lesson: (
            lesson.module.order if lesson.module_id else 9999,
            lesson.title.casefold(),
        ),
    )


def _course_card(course):
    lessons = _published_lessons(course)
    return {
        "slug": course.slug,
        "title": course.title,
        "trade": course.trade,
        "summary": course.summary or course.description[:240],
        "access": course.access,
        "accessLabel": course.get_access_display(),
        "level": course.level,
        "levelLabel": course.get_level_display(),
        "ageGroup": course.age_group,
        "durationHours": course.duration_hours,
        "language": course.language,
        "delivery": course.delivery,
        "deliveryLabel": course.get_delivery_display(),
        "provider": course.school.name if course.school_id else "OPedu",
        "lessonCount": len(lessons),
        "minutes": sum(lesson.estimated_minutes or 0 for lesson in lessons),
    }


class PublicCourseListView(APIView):
    """Every published course, with who can take it. Anyone may look."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(operation_id="public_courses_list", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({"courses": [_course_card(course) for course in _public_courses()]})


class PublicCourseDetailView(APIView):
    """One course's full description, modules and lessons."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(operation_id="public_course_retrieve", responses=OpenApiTypes.OBJECT)
    def get(self, request, slug):
        course = _public_courses().filter(slug=slug).first()
        if course is None:
            return Response({"detail": "Course not found."}, status=status.HTTP_404_NOT_FOUND)
        lessons = _published_lessons(course)
        playable = {
            scenario.lesson_id
            for scenario in SimulationScenario.objects.filter(
                lesson__in=lessons, status=SimulationScenario.Status.PUBLISHED
            )
        }
        modules = {module.pk: module for module in course.modules.all()}
        return Response(
            {
                **_course_card(course),
                "description": course.description,
                "outcomes": course.outcomes,
                "requirements": course.requirements,
                "prerequisites": course.prerequisites,
                "recognition": course.recognition,
                "lessons": [
                    {
                        "id": lesson.pk,
                        "title": lesson.title,
                        "summary": lesson.summary,
                        "minutes": lesson.estimated_minutes,
                        "module": modules[lesson.module_id].title
                        if lesson.module_id in modules
                        else "",
                        "language": lesson.get_language_display(),
                        # Public courses can be tried here without an account.
                        "canTry": course.access == Course.Access.PUBLIC and lesson.pk in playable,
                        "canEnrol": course.access != Course.Access.MEMBERS
                        and lesson.pk in playable,
                    }
                    for lesson in lessons
                ],
            }
        )


class PublicLessonPracticeView(APIView):
    """A lesson from a public course, practised on the device. Nothing is recorded."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(operation_id="public_lesson_practice", responses=OpenApiTypes.OBJECT)
    def get(self, request, slug, lesson_id):
        scenario = (
            SimulationScenario.objects.filter(
                status=SimulationScenario.Status.PUBLISHED,
                lesson_id=lesson_id,
                lesson__status=Lesson.Status.PUBLISHED,
                lesson__course__slug=slug,
                lesson__course__is_published=True,
                lesson__course__access=Course.Access.PUBLIC,
                lesson__course__school__is_active=True,
            )
            .select_related("lesson", "lesson__course", "grading_policy")
            .order_by("-version")
            .first()
        )
        if scenario is None:
            return Response(
                {"detail": "This lesson cannot be tried without an account."},
                status=status.HTTP_404_NOT_FOUND,
            )
        variant_code = choose_variant(scenario.definition)
        lesson = LessonSummarySerializer(
            scenario.lesson, context={"scenario": scenario, "variant_code": variant_code}
        ).data
        return Response(
            {
                "lesson": lesson,
                "scenario": SimulationScenarioSummarySerializer(scenario).data,
                "course": {
                    "slug": scenario.lesson.course.slug,
                    "title": scenario.lesson.course.title,
                },
            }
        )
