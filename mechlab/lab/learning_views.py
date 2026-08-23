import csv
import hashlib
import io
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .assessment_results import materialize_attempt_results
from .audit import record_audit_event
from .learning_serializers import (
    AdaptiveRecommendationSerializer,
    AssignmentSerializer,
    AttemptDetailSerializer,
    AttemptEventBatchSerializer,
    AttemptEventSerializer,
    AttemptSummarySerializer,
    AttemptSyncAuditInputSerializer,
    AttemptSyncAuditSerializer,
    HintRequestSerializer,
    HintResponseSerializer,
    InstructorAssignmentCreateResponseSerializer,
    InstructorAssignmentCreateSerializer,
    InstructorAssignmentOptionsSerializer,
    InstructorAttemptEvidenceSerializer,
    InstructorAttemptReviewSerializer,
    InstructorFeedbackSerializer,
    InstructorOverviewSerializer,
    KnowledgeCheckSubmissionSerializer,
    ProcedureStepSerializer,
    RecommendationOverrideSerializer,
    RendererSelectionSerializer,
    ResearchConsentPolicySerializer,
    ResearchSurveyResponseSerializer,
)
from .models import (
    AdaptiveRecommendation,
    Assignment,
    Attempt,
    AttemptEvent,
    AttemptSyncAudit,
    Cohort,
    Enrollment,
    KnowledgeCheckSubmission,
    Lesson,
    PilotObservation,
    ResearchConsentReceipt,
    ResearchSurveyResponse,
    School,
    SchoolMembership,
    SimulationScenario,
    XApiDelivery,
)
from .permissions import IsInstructorOrSchoolAdmin
from .research import research_participant_code
from .xapi_validation import validate_xapi_statement


def _next_sequence(attempt):
    latest = attempt.events.aggregate(latest=Max("sequence"))["latest"] or 0
    return latest + 1


def _activity_id(attempt, suffix="attempt"):
    return f"https://opedu.local/activities/{suffix}/{attempt.pk}"


def _event_activity_id(attempt, event_type, payload):
    step_code = payload.get("stepCode") or payload.get("expectedStepCode")
    if step_code:
        return (
            "https://opedu.local/activities/lessons/"
            f"{attempt.assignment.lesson.slug}/scenarios/{attempt.scenario.version}/steps/{step_code}"
        )
    return _activity_id(attempt, "attempts")


def _create_attempt_event(
    attempt,
    event_type,
    payload,
    *,
    event_id=None,
    renderer_mode=None,
    client_occurred_at=None,
):
    values = {
        "attempt": attempt,
        "sequence": _next_sequence(attempt),
        "event_type": event_type,
        "schema_version": 1,
        "activity_id": _event_activity_id(attempt, event_type, payload),
        "renderer_mode": renderer_mode or attempt.renderer_mode,
        "payload": payload,
        "client_occurred_at": client_occurred_at,
    }
    if event_id is not None:
        values["event_id"] = event_id
    return AttemptEvent.objects.create(**values)


def _parse_client_datetime(value):
    if not isinstance(value, str):
        return None
    parsed = parse_datetime(value)
    return parsed if parsed is not None and timezone.is_aware(parsed) else None


def _recommendation_for(attempt):
    safety_errors = attempt.events.filter(
        event_type__in=["incorrect_action", "tolerance_failed"],
        payload__safetyCritical=True,
    ).count()
    hints = attempt.events.filter(event_type="hint_used").count()
    snapshot = {
        "status": attempt.status,
        "outcome": attempt.outcome,
        "score": str(attempt.score) if attempt.score is not None else None,
        "safetyErrors": safety_errors,
        "hintsUsed": hints,
        "completedSteps": len(attempt.resume_state.get("completedSteps", [])),
    }
    if attempt.status == Attempt.Status.IN_PROGRESS:
        kind = AdaptiveRecommendation.Kind.CONTINUE
        rationale = "Continue the current procedure from the first incomplete step."
    elif safety_errors:
        kind = AdaptiveRecommendation.Kind.INSTRUCTOR_REVIEW
        rationale = "Instructor review is required because safety-critical evidence was recorded."
    elif attempt.outcome in {Attempt.Outcome.FAILED, Attempt.Outcome.REQUIRES_REVIEW}:
        kind = AdaptiveRecommendation.Kind.REMEDIATE
        rationale = "Review missed procedure evidence and complete a new versioned attempt."
    elif hints >= 2:
        kind = AdaptiveRecommendation.Kind.RETRY
        rationale = "Repeat the procedure independently to confirm performance without guidance."
    else:
        kind = AdaptiveRecommendation.Kind.COMPLETE
        rationale = "The recorded evidence meets the current deterministic completion rules."
    latest = attempt.recommendations.filter(
        rule_version="transparent-rules-v1",
        input_snapshot=snapshot,
    ).first()
    return latest or AdaptiveRecommendation.objects.create(
        attempt=attempt,
        rule_version="transparent-rules-v1",
        kind=kind,
        input_snapshot=snapshot,
        rationale=rationale,
        confidence=Decimal("1.000"),
    )


def _xapi_statements(attempt):
    actor_identifier = (
        (attempt.learner.email or f"opedu-user-{attempt.learner_id}@invalid.local").strip().lower()
    )
    actor_seed = f"mailto:{actor_identifier}"
    actor = {
        "objectType": "Agent",
        "mbox_sha1sum": hashlib.sha1(actor_seed.encode("utf-8"), usedforsecurity=False).hexdigest(),
    }
    verb_map = {
        "attempt_started": ("initialized", "initialized"),
        "step_completed": ("completed", "completed"),
        "incorrect_action": ("interacted", "interacted"),
        "tolerance_failed": ("interacted", "interacted"),
        "hint_used": ("experienced", "experienced"),
        "attempt_completed": ("completed", "completed"),
        "attempt_abandoned": ("terminated", "terminated"),
        "ar_session_started": ("launched", "launched"),
        "ar_marker_found": ("interacted", "recognized"),
        "ar_fallback_used": ("experienced", "used fallback"),
    }
    statements = []
    for event in attempt.events.all():
        verb_id, display = verb_map.get(event.event_type, ("experienced", event.event_type))
        result = {
            "extensions": {
                "https://opedu.local/extensions/event-type": event.event_type,
                "https://opedu.local/extensions/renderer-mode": event.renderer_mode,
                "https://opedu.local/extensions/payload": event.payload,
            },
        }
        action_code = event.payload.get("action")
        if action_code:
            result["extensions"]["https://opedu.local/extensions/action-id"] = (
                f"https://opedu.local/actions/{action_code}"
            )
        if event.event_type in {"step_completed", "incorrect_action", "tolerance_failed"}:
            result["success"] = event.event_type == "step_completed"
        statements.append(
            {
                "id": str(event.event_id),
                "version": "1.0.3",
                "actor": actor,
                "verb": {
                    "id": f"http://adlnet.gov/expapi/verbs/{verb_id}",
                    "display": {"en-US": display},
                },
                "object": {
                    "objectType": "Activity",
                    "id": event.activity_id or _activity_id(attempt),
                    "definition": {
                        "name": {"en-US": attempt.assignment.lesson.title},
                        "type": "https://opedu.local/activity-types/technical-procedure",
                    },
                },
                "result": result,
                "context": {
                    "extensions": {
                        "https://opedu.local/extensions/scenario-version": attempt.scenario.version,
                        "https://opedu.local/extensions/grading-policy-version": attempt.grading_policy.version,
                        "https://opedu.local/extensions/learning-mode": attempt.learning_mode,
                    }
                },
                "timestamp": event.occurred_at.isoformat(),
            }
        )
    return statements


def _procedure_progress(attempt):
    steps = attempt.scenario.definition.get("steps", [])
    completed_codes = {
        event.payload.get("stepCode")
        for event in attempt.events.filter(event_type="step_completed")
    }
    current_step = next((step for step in steps if step["code"] not in completed_codes), None)
    return steps, completed_codes, current_step


def _step_feedback(step, outcome, fallback):
    return step.get("feedback_rules", {}).get(outcome, fallback)


def _evaluate_action(step, action_code, metadata):
    actions = step.get("acceptable_actions") or [
        {
            "action_code": step["action_code"],
            "tolerance": None,
        }
    ]
    action = next((item for item in actions if item["action_code"] == action_code), None)
    if action is None:
        return False, None
    tolerance = action.get("tolerance")
    if tolerance is None:
        return True, None
    try:
        measured_value = Decimal(
            str(metadata.get("measurement", step.get("metadata", {}).get("reading")))
        )
        minimum = Decimal(tolerance["minimum_value"])
        maximum = Decimal(tolerance["maximum_value"])
    except (KeyError, InvalidOperation, TypeError):
        return False, {
            "code": tolerance["code"],
            "passed": False,
            "reason": "A numeric measurement is required.",
        }
    passed = minimum <= measured_value <= maximum
    return passed, {
        "code": tolerance["code"],
        "measurement": str(measured_value),
        "minimum": str(minimum),
        "maximum": str(maximum),
        "unit": tolerance["unit"],
        "passed": passed,
    }


def _instructor_school_ids(user):
    if user.is_superuser:
        return list(School.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        SchoolMembership.objects.filter(
            user=user,
            is_active=True,
            role__in=[SchoolMembership.Role.ADMIN, SchoolMembership.Role.INSTRUCTOR],
            school__is_active=True,
        ).values_list("school_id", flat=True)
    )


def _instructor_attempt_queryset(user):
    school_ids = _instructor_school_ids(user)
    if not school_ids and not user.is_superuser:
        raise PermissionDenied("An active instructor or school administrator role is required.")
    return (
        Attempt.objects.filter(
            learner__school_memberships__school_id__in=school_ids,
            learner__school_memberships__is_active=True,
        )
        .select_related(
            "learner",
            "assignment",
            "assignment__lesson",
            "assignment__lesson__course",
            "scenario",
            "grading_policy",
        )
        .prefetch_related(
            "events",
            "step_results",
            "competency_results",
            "feedback__author",
            "recommendations",
            "xapi_deliveries",
            "scenario__asset_package__files",
        )
        .distinct()
    )


class InstructorOverviewView(APIView):
    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses=InstructorOverviewSerializer)
    def get(self, request):
        school_ids = _instructor_school_ids(request.user)
        if not school_ids and not request.user.is_superuser:
            raise PermissionDenied("An active instructor or school administrator role is required.")

        assignments = Assignment.objects.filter(
            learner__school_memberships__school_id__in=school_ids,
            learner__school_memberships__is_active=True,
        ).distinct()
        attempts = list(_instructor_attempt_queryset(request.user).order_by("-updated_at"))
        operational_events = [event for attempt in attempts for event in attempt.events.all()]
        safety_errors = sum(
            event.event_type == "incorrect_action" and event.payload.get("safetyCritical") is True
            for attempt in attempts
            for event in attempt.events.all()
        )
        competency_aggregation = {}
        for attempt in attempts:
            for result in attempt.competency_results.all():
                item = competency_aggregation.setdefault(
                    result.competency.code,
                    {
                        "code": result.competency.code,
                        "title": result.competency.title,
                        "attempts": 0,
                        "mastered": 0,
                        "requiresReview": 0,
                    },
                )
                item["attempts"] += 1
                item["mastered"] += int(result.mastery_state == "mastered")
                item["requiresReview"] += int(result.mastery_state == "requires_review")
        now = timezone.now()
        return Response(
            {
                "metrics": {
                    "learners": assignments.values("learner_id").distinct().count(),
                    "assignments": assignments.count(),
                    "attempts": len(attempts),
                    "completedAttempts": sum(
                        attempt.status == Attempt.Status.COMPLETED for attempt in attempts
                    ),
                    "inProgressAttempts": sum(
                        attempt.status == Attempt.Status.IN_PROGRESS for attempt in attempts
                    ),
                    "safetyErrors": safety_errors,
                    "overdueAttempts": sum(
                        bool(
                            attempt.assignment.due_at
                            and attempt.assignment.due_at < now
                            and attempt.status == Attempt.Status.IN_PROGRESS
                        )
                        for attempt in attempts
                    ),
                    "requiresReview": sum(
                        attempt.status == Attempt.Status.REQUIRES_REVIEW for attempt in attempts
                    ),
                    "failedAttempts": sum(
                        attempt.outcome == Attempt.Outcome.FAILED for attempt in attempts
                    ),
                },
                "attempts": InstructorAttemptEvidenceSerializer(attempts, many=True).data,
                "competencies": list(competency_aggregation.values()),
                "operationalAnalytics": {
                    "learning": {
                        "masteredAttempts": sum(
                            attempt.outcome == Attempt.Outcome.MASTERED for attempt in attempts
                        ),
                        "failedAttempts": sum(
                            attempt.outcome == Attempt.Outcome.FAILED for attempt in attempts
                        ),
                    },
                    "recognition": {
                        "markerFound": sum(
                            event.event_type == "ar_marker_found" for event in operational_events
                        ),
                        "markerMismatch": sum(
                            event.event_type == "ar_marker_mismatch" for event in operational_events
                        ),
                        "trackingLoss": sum(
                            event.event_type == "ar_marker_lost" for event in operational_events
                        ),
                        "placements": sum(
                            event.event_type == "ar_placement_confirmed"
                            for event in operational_events
                        ),
                    },
                    "deviceReliability": {
                        "performanceSamples": sum(
                            event.event_type == "performance_sample" for event in operational_events
                        ),
                        "lowFrameRateSamples": sum(
                            event.event_type == "performance_sample"
                            and isinstance(event.payload.get("framesPerSecond"), (int, float))
                            and event.payload["framesPerSecond"] < 24
                            for event in operational_events
                        ),
                        "assetFailures": sum(
                            event.event_type == "asset_load_failed" for event in operational_events
                        ),
                    },
                    "synchronization": {
                        "stateChanges": sum(
                            event.event_type == "sync_state_changed" for event in operational_events
                        ),
                        "xapiPending": sum(
                            delivery.status
                            in {
                                XApiDelivery.Status.PENDING,
                                XApiDelivery.Status.FAILED,
                            }
                            for attempt in attempts
                            for delivery in attempt.xapi_deliveries.all()
                        ),
                        "xapiDeadLetters": sum(
                            delivery.status == XApiDelivery.Status.DEAD_LETTER
                            for attempt in attempts
                            for delivery in attempt.xapi_deliveries.all()
                        ),
                    },
                    "fallback": {
                        "accessibleAttempts": sum(
                            attempt.renderer_mode == Attempt.RendererMode.ACCESSIBLE_2D
                            for attempt in attempts
                        ),
                        "arFallbackEvents": sum(
                            event.event_type == "ar_fallback_used" for event in operational_events
                        ),
                    },
                },
            }
        )


class InstructorAssignmentView(APIView):
    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses=InstructorAssignmentOptionsSerializer)
    def get(self, request):
        school_ids = _instructor_school_ids(request.user)
        learners = (
            SchoolMembership.objects.filter(
                school_id__in=school_ids,
                role=SchoolMembership.Role.LEARNER,
                is_active=True,
                user__is_active=True,
            )
            .select_related("user", "school")
            .order_by("user__first_name", "user__last_name", "user__username")
        )
        scenarios = (
            SimulationScenario.objects.filter(
                status=SimulationScenario.Status.PUBLISHED,
                lesson__status=Lesson.Status.PUBLISHED,
                lesson__course__school_id__in=school_ids,
            )
            .select_related("lesson", "lesson__course")
            .order_by("lesson__title", "-version")
        )
        cohorts = Cohort.objects.filter(school_id__in=school_ids, is_active=True).order_by("name")
        return Response(
            {
                "learners": [
                    {
                        "id": item.user_id,
                        "name": item.user.get_full_name() or item.user.get_username(),
                        "email": item.user.email,
                        "school": item.school.name,
                    }
                    for item in learners
                ],
                "cohorts": [
                    {
                        "id": cohort.pk,
                        "name": cohort.name,
                        "code": cohort.code,
                        "learnerCount": cohort.enrollments.filter(
                            status=Enrollment.Status.ACTIVE
                        ).count(),
                    }
                    for cohort in cohorts
                ],
                "scenarios": [
                    {
                        "id": item.pk,
                        "lessonId": item.lesson_id,
                        "lessonTitle": item.lesson.title,
                        "courseTitle": item.lesson.course.title,
                        "version": item.version,
                    }
                    for item in scenarios
                ],
            }
        )

    @extend_schema(
        request=InstructorAssignmentCreateSerializer,
        responses=InstructorAssignmentCreateResponseSerializer,
    )
    def post(self, request):
        serializer = InstructorAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school_ids = _instructor_school_ids(request.user)
        values = serializer.validated_data
        scenario = (
            SimulationScenario.objects.filter(
                pk=values["scenarioId"],
                status=SimulationScenario.Status.PUBLISHED,
                lesson__status=Lesson.Status.PUBLISHED,
                lesson__course__school_id__in=school_ids,
            )
            .select_related("lesson")
            .first()
        )
        if scenario is None:
            return Response({"detail": "Scenario not found."}, status=status.HTTP_404_NOT_FOUND)
        cohort_learner_ids = set(
            Enrollment.objects.filter(
                cohort_id__in=values["cohortIds"],
                cohort__school_id__in=school_ids,
                cohort__is_active=True,
                status=Enrollment.Status.ACTIVE,
            ).values_list("learner_id", flat=True)
        )
        valid_cohort_ids = set(
            Cohort.objects.filter(
                id__in=values["cohortIds"], school_id__in=school_ids, is_active=True
            ).values_list("id", flat=True)
        )
        if valid_cohort_ids != set(values["cohortIds"]):
            raise PermissionDenied("Every selected cohort must belong to your active school.")
        requested_learner_ids = set(values["learnerIds"]) | cohort_learner_ids
        if not requested_learner_ids:
            return Response(
                {"detail": "The selected cohorts have no active learners."},
                status=status.HTTP_409_CONFLICT,
            )
        valid_learner_ids = set(
            SchoolMembership.objects.filter(
                school_id__in=school_ids,
                role=SchoolMembership.Role.LEARNER,
                is_active=True,
                user__is_active=True,
                user_id__in=requested_learner_ids,
            ).values_list("user_id", flat=True)
        )
        if valid_learner_ids != requested_learner_ids:
            raise PermissionDenied("Every selected learner must belong to your active school.")
        assignment_ids = []
        created_count = 0
        with transaction.atomic():
            for learner_id in sorted(valid_learner_ids):
                assignment, created = Assignment.objects.get_or_create(
                    scenario=scenario,
                    learner_id=learner_id,
                    defaults={
                        "lesson": scenario.lesson,
                        "assigned_by": request.user,
                        "available_at": values.get("availableAt"),
                        "due_at": values.get("dueAt"),
                        "attempt_limit": values["attemptLimit"],
                        "instructions": values["instructions"],
                    },
                )
                assignment_ids.append(assignment.pk)
                created_count += int(created)
                if created:
                    membership = request.user.school_memberships.filter(
                        school_id__in=school_ids,
                        is_active=True,
                    ).first()
                    record_audit_event(
                        event_type="assignment.created",
                        actor=request.user,
                        school=membership.school if membership else None,
                        target=assignment,
                        payload={"scenarioId": scenario.pk, "learnerId": learner_id},
                    )
        return Response(
            {
                "assignmentIds": assignment_ids,
                "created": created_count,
                "existing": len(assignment_ids) - created_count,
            },
            status=status.HTTP_201_CREATED if created_count else status.HTTP_200_OK,
        )


class InstructorEvidenceExportView(APIView):
    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses={(200, "text/csv"): bytes})
    def get(self, request):
        research_export = request.query_params.get("scope") == "research"
        attempts = _instructor_attempt_queryset(request.user).order_by("id")
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(
            [
                "attempt_id",
                "learner",
                "lesson",
                "scenario_version",
                "renderer_mode",
                "status",
                "score",
                "started_at",
                "completed_at",
                "duration_seconds",
                "incorrect_actions",
                "safety_errors",
                "hints",
                "competency_results",
            ]
        )
        for attempt in attempts:
            learner = (
                research_participant_code(
                    attempt.assignment.lesson.course.school_id,
                    attempt.learner_id,
                )
                if research_export
                else attempt.learner.get_full_name() or attempt.learner.get_username()
            )
            events = list(attempt.events.all())
            completed_at = attempt.completed_at
            duration = (
                int((completed_at - attempt.started_at).total_seconds()) if completed_at else ""
            )
            competency_results = ";".join(
                f"{item.competency.code}:{item.mastery_state}:{item.mastery_percentage}"
                for item in attempt.competency_results.all()
            )
            writer.writerow(
                [
                    attempt.pk,
                    learner,
                    attempt.assignment.lesson.title,
                    attempt.scenario.version,
                    attempt.renderer_mode,
                    attempt.status,
                    attempt.score or "",
                    attempt.started_at.isoformat(),
                    completed_at.isoformat() if completed_at else "",
                    duration,
                    sum(event.event_type == "incorrect_action" for event in events),
                    sum(
                        event.event_type == "incorrect_action"
                        and event.payload.get("safetyCritical") is True
                        for event in events
                    ),
                    sum(event.event_type == "hint_requested" for event in events),
                    competency_results,
                ]
            )
        response = HttpResponse(stream.getvalue(), content_type="text/csv; charset=utf-8")
        scope = "research" if research_export else "operational"
        response["Content-Disposition"] = f'attachment; filename="opedu-{scope}-evidence.csv"'
        response["Cache-Control"] = "private, no-store"
        return response


class InstructorAttemptReviewView(APIView):
    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses=InstructorAttemptReviewSerializer)
    def get(self, request, pk):
        attempt = _instructor_attempt_queryset(request.user).filter(pk=pk).first()
        if attempt is None:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(InstructorAttemptReviewSerializer(attempt).data)

    @extend_schema(request=InstructorFeedbackSerializer, responses=InstructorFeedbackSerializer)
    def post(self, request, pk):
        attempt = _instructor_attempt_queryset(request.user).filter(pk=pk).first()
        if attempt is None:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = InstructorFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = serializer.save(attempt=attempt, author=request.user)
        membership = request.user.school_memberships.filter(is_active=True).first()
        record_audit_event(
            event_type="assessment.feedback_published"
            if feedback.is_published
            else "assessment.feedback_saved",
            actor=request.user,
            school=membership.school if membership else None,
            target=attempt,
            payload={"feedbackId": feedback.pk},
        )
        return Response(
            InstructorFeedbackSerializer(feedback).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=RecommendationOverrideSerializer,
        responses=AdaptiveRecommendationSerializer,
    )
    def patch(self, request, pk):
        attempt = _instructor_attempt_queryset(request.user).filter(pk=pk).first()
        if attempt is None:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        recommendation = attempt.recommendations.first()
        if recommendation is None:
            return Response(
                {"detail": "This attempt has no recommendation to override."},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = RecommendationOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        recommendation.override_kind = serializer.validated_data["kind"]
        recommendation.override_reason = serializer.validated_data["reason"]
        recommendation.overridden_by = request.user
        recommendation.save(update_fields=["override_kind", "override_reason", "overridden_by"])
        membership = request.user.school_memberships.filter(is_active=True).first()
        record_audit_event(
            event_type="assessment.recommendation_overridden",
            actor=request.user,
            school=membership.school if membership else None,
            target=attempt,
            payload={
                "recommendationId": recommendation.pk,
                "originalKind": recommendation.kind,
                "overrideKind": recommendation.override_kind,
            },
        )
        return Response(AdaptiveRecommendationSerializer(recommendation).data)


class ResearchConsentPolicyView(APIView):
    @extend_schema(responses=ResearchConsentPolicySerializer)
    def get(self, request):
        return Response(
            {
                "version": settings.RESEARCH_CONSENT_VERSION,
                "retention_days": settings.RESEARCH_RETENTION_DAYS,
                "status": settings.RESEARCH_CONSENT_STATUS,
                "privacy_path": "/privacy",
            }
        )


class ResearchSurveyView(APIView):
    @extend_schema(
        request=ResearchSurveyResponseSerializer,
        responses=ResearchSurveyResponseSerializer,
    )
    def post(self, request):
        if settings.RESEARCH_CONSENT_STATUS != "approved":
            return Response(
                {"detail": "Research collection is disabled until the consent policy is approved."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        membership = (
            request.user.school_memberships.filter(
                is_active=True,
                school__is_active=True,
            )
            .select_related("school")
            .first()
        )
        if membership is None:
            raise PermissionDenied("An active school membership is required.")
        serializer = ResearchSurveyResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        participant_code = research_participant_code(membership.school_id, request.user.pk)
        values = serializer.validated_data
        values.pop("consent_accepted")
        now = timezone.now()
        expires_at = now + timedelta(days=settings.RESEARCH_RETENTION_DAYS)
        with transaction.atomic():
            receipt, _ = ResearchConsentReceipt.objects.update_or_create(
                school=membership.school,
                participant_code=participant_code,
                consent_version=values["consent_version"],
                scenario_version=values.get("scenario_version", ""),
                defaults={
                    "status": ResearchConsentReceipt.Status.ACTIVE,
                    "consented_at": now,
                    "withdrawn_at": None,
                    "expires_at": expires_at,
                },
            )
            response, _ = ResearchSurveyResponse.objects.update_or_create(
                school=membership.school,
                participant_code=participant_code,
                instrument=values["instrument"],
                scenario_version=values.get("scenario_version", ""),
                defaults={
                    "responses": values["responses"],
                    "consent_version": values["consent_version"],
                },
            )
            record_audit_event(
                event_type="research.consent_recorded",
                actor=request.user,
                school=membership.school,
                target=receipt,
                payload={
                    "consentVersion": receipt.consent_version,
                    "scenarioVersion": receipt.scenario_version,
                    "expiresAt": receipt.expires_at.isoformat(),
                },
            )
        return Response(
            ResearchSurveyResponseSerializer(response).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=ResearchSurveyResponseSerializer(many=True))
    def get(self, request):
        school_ids = _instructor_school_ids(request.user)
        if not school_ids and not request.user.is_superuser:
            raise PermissionDenied("An active instructor or school administrator role is required.")
        responses = ResearchSurveyResponse.objects.filter(school_id__in=school_ids)
        return Response(ResearchSurveyResponseSerializer(responses, many=True).data)

    @extend_schema(responses={status.HTTP_204_NO_CONTENT: None})
    def delete(self, request):
        membership = (
            request.user.school_memberships.filter(is_active=True, school__is_active=True)
            .select_related("school")
            .first()
        )
        if membership is None:
            raise PermissionDenied("An active school membership is required.")
        participant_code = research_participant_code(membership.school_id, request.user.pk)
        now = timezone.now()
        with transaction.atomic():
            deleted, _ = ResearchSurveyResponse.objects.filter(
                school=membership.school,
                participant_code=participant_code,
            ).delete()
            pilot_deleted, _ = PilotObservation.objects.filter(
                study__school=membership.school,
                participant_code=participant_code,
            ).delete()
            withdrawn = ResearchConsentReceipt.objects.filter(
                school=membership.school,
                participant_code=participant_code,
                status=ResearchConsentReceipt.Status.ACTIVE,
            ).update(status=ResearchConsentReceipt.Status.WITHDRAWN, withdrawn_at=now)
            record_audit_event(
                event_type="research.responses_withdrawn",
                actor=request.user,
                school=membership.school,
                target=membership.school,
                payload={
                    "deletedResponses": deleted,
                    "deletedPilotObservations": pilot_deleted,
                    "withdrawnConsents": withdrawn,
                },
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Assignment.objects.none()
    serializer_class = AssignmentSerializer
    search_fields = ["lesson__title", "lesson__course__title", "lesson__course__trade"]
    ordering_fields = ["created_at", "due_at", "lesson__title"]
    ordering = ["due_at", "-created_at"]

    def get_queryset(self):
        return (
            Assignment.objects.filter(
                learner=self.request.user,
                lesson__status=Lesson.Status.PUBLISHED,
                scenario__status=SimulationScenario.Status.PUBLISHED,
            )
            .select_related(
                "lesson",
                "lesson__course",
                "assigned_by",
                "scenario",
                "scenario__grading_policy",
                "scenario__asset_package",
            )
            .prefetch_related(
                "lesson__competencies",
                "lesson__procedure_steps",
                "attempts",
                "scenario__asset_package__files",
            )
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        assignment = self.get_object()
        if assignment.available_at and assignment.available_at > timezone.now():
            return Response(
                {"detail": "This assignment is not available yet."},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            assignment = Assignment.objects.select_for_update().get(pk=assignment.pk)
            attempt = assignment.attempts.filter(
                learner=request.user,
                status=Attempt.Status.IN_PROGRESS,
            ).first()
            created = attempt is None
            if created:
                if (
                    assignment.attempts.filter(learner=request.user).count()
                    >= assignment.attempt_limit
                ):
                    return Response(
                        {"detail": "The attempt limit for this assignment has been reached."},
                        status=status.HTTP_409_CONFLICT,
                    )
                scenario_steps = assignment.scenario.definition.get("steps", [])
                attempt = Attempt.objects.create(
                    assignment=assignment,
                    learner=request.user,
                    scenario=assignment.scenario,
                    grading_policy=assignment.scenario.grading_policy,
                    resume_state={
                        "completedSteps": [],
                        "currentStep": scenario_steps[0]["code"] if scenario_steps else None,
                    },
                )
                _create_attempt_event(
                    attempt,
                    "attempt_started",
                    {
                        "lessonId": assignment.lesson_id,
                        "scenarioVersion": attempt.scenario.version,
                        "gradingPolicyVersion": attempt.grading_policy.version,
                    },
                )
                membership = request.user.school_memberships.filter(is_active=True).first()
                record_audit_event(
                    event_type="assessment.attempt_started",
                    actor=request.user,
                    school=membership.school if membership else None,
                    target=attempt,
                    payload={
                        "assignmentId": assignment.pk,
                        "scenarioVersion": attempt.scenario.version,
                        "gradingPolicyVersion": attempt.grading_policy.version,
                    },
                )
        return Response(
            {"attempt": AttemptSummarySerializer(attempt).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "post"], url_path="knowledge-check")
    def knowledge_check(self, request, pk=None):
        assignment = self.get_object()
        submission = KnowledgeCheckSubmission.objects.filter(
            assignment=assignment,
            learner=request.user,
        ).first()
        if request.method == "GET":
            return Response(
                KnowledgeCheckSubmissionSerializer(submission).data if submission else None
            )
        serializer = KnowledgeCheckSubmissionSerializer(
            submission,
            data=request.data,
            partial=submission is not None,
        )
        serializer.is_valid(raise_exception=True)
        answers = serializer.validated_data.get("answers", submission.answers if submission else [])
        true_answers = sum(
            isinstance(item, dict) and item.get("response") is True for item in answers
        )
        score = (
            (Decimal(true_answers) / Decimal(len(answers)) * 100).quantize(Decimal("0.01"))
            if answers
            else None
        )
        saved = serializer.save(assignment=assignment, learner=request.user, score=score)
        return Response(
            KnowledgeCheckSubmissionSerializer(saved).data,
            status=status.HTTP_200_OK if submission else status.HTTP_201_CREATED,
        )


class AttemptViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Attempt.objects.none()
    serializer_class = AttemptDetailSerializer
    search_fields = ["assignment__lesson__title", "status"]
    ordering_fields = ["started_at", "completed_at", "updated_at", "score"]
    ordering = ["-started_at"]

    def get_queryset(self):
        return (
            Attempt.objects.filter(learner=self.request.user)
            .select_related(
                "assignment",
                "assignment__lesson",
                "assignment__lesson__course",
                "assignment__assigned_by",
                "scenario",
                "grading_policy",
            )
            .prefetch_related(
                "assignment__lesson__competencies",
                "assignment__attempts",
                "events",
                "step_results",
                "competency_results",
                "feedback__author",
                "recommendations",
                "scenario__asset_package__files",
            )
        )

    @action(detail=True, methods=["post"], url_path="renderer")
    @extend_schema(request=RendererSelectionSerializer, responses=AttemptSummarySerializer)
    def select_renderer(self, request, pk=None):
        serializer = RendererSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            attempt.renderer_mode = serializer.validated_data["mode"]
            attempt.learning_mode = serializer.validated_data.get(
                "learningMode", attempt.learning_mode
            )
            attempt.capability_profile = serializer.validated_data.get("capabilityProfile", {})
            attempt.save(
                update_fields=[
                    "renderer_mode",
                    "learning_mode",
                    "capability_profile",
                    "updated_at",
                ]
            )
            _create_attempt_event(
                attempt,
                "renderer_selected",
                {
                    "capabilityProfile": attempt.capability_profile,
                    "learningMode": attempt.learning_mode,
                },
                renderer_mode=attempt.renderer_mode,
            )
        return Response(AttemptSummarySerializer(attempt).data)

    @action(detail=True, methods=["post"], url_path="events/batch")
    @extend_schema(request=AttemptEventBatchSerializer, responses=AttemptEventSerializer(many=True))
    def ingest_event_batch(self, request, pk=None):
        serializer = AttemptEventBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        accepted = []
        deduplicated = 0
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            events = serializer.validated_data["events"]
            existing_events = {
                item.event_id: item
                for item in AttemptEvent.objects.filter(
                    event_id__in=[event["eventId"] for event in events]
                )
            }
            if any(item.attempt_id != attempt.pk for item in existing_events.values()):
                return Response(
                    {"detail": "An event ID cannot be reused across attempts."},
                    status=status.HTTP_409_CONFLICT,
                )
            for item in events:
                existing = existing_events.get(item["eventId"])
                if existing is not None:
                    accepted.append(existing)
                    deduplicated += 1
                    continue
                accepted.append(
                    _create_attempt_event(
                        attempt,
                        item["eventType"],
                        item.get("payload", {}),
                        event_id=item["eventId"],
                        renderer_mode=item["rendererMode"],
                        client_occurred_at=item["occurredAt"],
                    )
                )
            membership = request.user.school_memberships.filter(is_active=True).first()
            record_audit_event(
                event_type="evidence.batch_ingested",
                actor=request.user,
                school=membership.school if membership else None,
                target=attempt,
                payload={
                    "received": len(events),
                    "created": len(events) - deduplicated,
                    "deduplicated": deduplicated,
                },
            )
        return Response(AttemptEventSerializer(accepted, many=True).data)

    @extend_schema(request=AttemptSyncAuditInputSerializer, responses=AttemptSyncAuditSerializer)
    @action(detail=True, methods=["post"], url_path="sync-audit")
    def sync_audit(self, request, pk=None):
        serializer = AttemptSyncAuditInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attempt = self.get_object()
        values = serializer.validated_data
        client_ids = [str(value) for value in values["eventIds"]]
        server_ids = [
            str(value)
            for value in AttemptEvent.objects.filter(
                attempt=attempt,
                event_id__in=values["eventIds"],
            )
            .order_by("sequence")
            .values_list("event_id", flat=True)
        ]
        missing_ids = sorted(set(client_ids) - set(server_ids))
        audit = AttemptSyncAudit.objects.create(
            attempt=attempt,
            client_event_ids=client_ids,
            server_event_ids=server_ids,
            missing_event_ids=missing_ids,
            pending_count=values["pendingCount"],
            passed=not missing_ids and values["pendingCount"] == 0,
            client_created_at=values["clientCreatedAt"],
        )
        membership = request.user.school_memberships.filter(is_active=True).first()
        record_audit_event(
            event_type="evidence.sync_reconciled",
            actor=request.user,
            school=membership.school if membership else None,
            target=attempt,
            payload={
                "auditId": str(audit.audit_id),
                "clientEvents": len(client_ids),
                "missingEvents": len(missing_ids),
                "pendingCount": audit.pending_count,
                "passed": audit.passed,
            },
        )
        return Response(AttemptSyncAuditSerializer(audit).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="xapi")
    def xapi(self, request, pk=None):
        attempt = self.get_object()
        statements = _xapi_statements(attempt)
        return Response(
            {
                "attemptId": attempt.pk,
                "authoritativeSource": "PostgreSQL",
                "conformance": {
                    "profile": "xAPI 1.0.3 minimal statement boundary",
                    "valid": all(not validate_xapi_statement(item) for item in statements),
                },
                "statements": statements,
            }
        )

    @action(detail=True, methods=["get"], url_path="recommendation")
    @extend_schema(responses=AdaptiveRecommendationSerializer)
    def recommendation(self, request, pk=None):
        attempt = self.get_object()
        recommendation = _recommendation_for(attempt)
        return Response(AdaptiveRecommendationSerializer(recommendation).data)

    @action(detail=True, methods=["post"], url_path="actions")
    def record_action(self, request, pk=None):
        action_code = request.data.get("action")
        metadata = request.data.get("metadata", {})
        event_id = request.data.get("eventId")
        if not isinstance(action_code, str) or not action_code.strip():
            return Response(
                {"detail": "A non-empty action is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(metadata, dict):
            return Response(
                {"detail": "Metadata must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if event_id:
            try:
                event_id = uuid.UUID(str(event_id))
            except (ValueError, TypeError, AttributeError):
                return Response(
                    {"detail": "eventId must be a valid UUID."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if event_id:
                existing = AttemptEvent.objects.filter(event_id=event_id).first()
                if existing is not None:
                    if existing.attempt_id != attempt.pk:
                        return Response(
                            {"detail": "An event ID cannot be reused across attempts."},
                            status=status.HTTP_409_CONFLICT,
                        )
                    if existing.payload.get("action") not in {None, action_code}:
                        return Response(
                            {"detail": "An event ID cannot be reused for a different action."},
                            status=status.HTTP_409_CONFLICT,
                        )
                    _, _, next_step = _procedure_progress(attempt)
                    return Response(
                        {
                            "correct": existing.event_type == "step_completed",
                            "message": "This action was already synchronized.",
                            "currentStep": ProcedureStepSerializer(next_step).data
                            if next_step
                            else None,
                            "isReadyToComplete": next_step is None,
                            "attempt": AttemptSummarySerializer(attempt).data,
                        }
                    )
            if attempt.status != Attempt.Status.IN_PROGRESS:
                return Response(
                    {"detail": "This attempt is no longer active."},
                    status=status.HTTP_409_CONFLICT,
                )

            submitted_scenario_version = metadata.get("scenarioVersion")
            if submitted_scenario_version is not None and str(submitted_scenario_version) != str(
                attempt.scenario.version
            ):
                return Response(
                    {
                        "detail": "The offline evidence uses a stale scenario version; keep it for instructor review."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            steps, completed_codes, current_step = _procedure_progress(attempt)
            if not steps:
                return Response(
                    {"detail": "This lesson has no published procedure."},
                    status=status.HTTP_409_CONFLICT,
                )
            if current_step is None:
                return Response(
                    {
                        "correct": True,
                        "message": "All procedure steps are complete. Submit the attempt for scoring.",
                        "currentStep": None,
                        "isReadyToComplete": True,
                        "attempt": AttemptSummarySerializer(attempt).data,
                    }
                )

            is_correct, tolerance_result = _evaluate_action(
                current_step,
                action_code,
                metadata,
            )
            event_type = (
                "step_completed"
                if is_correct
                else "tolerance_failed"
                if tolerance_result is not None
                else "incorrect_action"
            )
            payload = {
                "action": action_code,
                "expectedStepCode": current_step["code"],
                "safetyCritical": current_step.get("safety_critical", False),
                "metadata": metadata,
            }
            if tolerance_result is not None:
                payload["tolerance"] = tolerance_result
            if is_correct:
                payload.update(
                    {
                        "stepCode": current_step["code"],
                        "points": current_step.get("points", 10),
                    }
                )
            _create_attempt_event(
                attempt,
                event_type,
                payload,
                event_id=event_id,
                renderer_mode=metadata.get("rendererMode", attempt.renderer_mode),
                client_occurred_at=_parse_client_datetime(metadata.get("occurredAt")),
            )

            if is_correct:
                completed_codes.add(current_step["code"])
                next_step = next(
                    (step for step in steps if step["code"] not in completed_codes),
                    None,
                )
                attempt.resume_state = {
                    "completedSteps": [
                        step["code"] for step in steps if step["code"] in completed_codes
                    ],
                    "currentStep": next_step["code"] if next_step else None,
                }
                attempt.save(update_fields=["resume_state", "updated_at"])
                message = _step_feedback(
                    current_step,
                    "correct",
                    current_step.get("feedback", "Step completed."),
                )
            else:
                next_step = current_step
                feedback_outcome = (
                    "tolerance"
                    if tolerance_result is not None
                    else "safety"
                    if current_step.get("safety_critical", False)
                    else "incorrect"
                )
                message = _step_feedback(
                    current_step,
                    feedback_outcome,
                    "Safety sequence interrupted. Follow the highlighted instruction before continuing."
                    if feedback_outcome == "safety"
                    else "The measurement is outside the acceptable tolerance."
                    if feedback_outcome == "tolerance"
                    else "That action is out of sequence. Review the current instruction and try again.",
                )

        return Response(
            {
                "correct": is_correct,
                "message": message,
                "currentStep": ProcedureStepSerializer(next_step).data if next_step else None,
                "isReadyToComplete": next_step is None,
                "attempt": AttemptSummarySerializer(attempt).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="hints")
    @extend_schema(request=HintRequestSerializer, responses=HintResponseSerializer)
    def request_hint(self, request, pk=None):
        request_serializer = HintRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        requested_code = request_serializer.validated_data.get("hintCode")
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if attempt.status != Attempt.Status.IN_PROGRESS:
                return Response(
                    {"detail": "This attempt is no longer active."},
                    status=status.HTTP_409_CONFLICT,
                )
            _, _, current_step = _procedure_progress(attempt)
            if current_step is None:
                return Response(
                    {"detail": "All procedure steps are complete."},
                    status=status.HTTP_409_CONFLICT,
                )
            used_codes = set(
                attempt.events.filter(
                    event_type="hint_used",
                    payload__stepCode=current_step["code"],
                ).values_list("payload__hintCode", flat=True)
            )
            hints = current_step.get("hints", [])
            hint = next(
                (
                    item
                    for item in hints
                    if item["code"] == requested_code and item["code"] not in used_codes
                ),
                None,
            )
            if requested_code is None:
                hint = next((item for item in hints if item["code"] not in used_codes), None)
            if hint is None:
                return Response(
                    {"detail": "No unused hint is available for the current step."},
                    status=status.HTTP_409_CONFLICT,
                )
            _create_attempt_event(
                attempt,
                "hint_used",
                {
                    "stepCode": current_step["code"],
                    "hintCode": hint["code"],
                    "pointsPenalty": hint.get("points_penalty", 0),
                },
            )
        return Response({"hint": hint, "attempt": AttemptSummarySerializer(attempt).data})

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if attempt.status in {Attempt.Status.COMPLETED, Attempt.Status.REQUIRES_REVIEW}:
                return Response({"attempt": AttemptDetailSerializer(attempt).data})
            if attempt.status != Attempt.Status.IN_PROGRESS:
                return Response(
                    {"detail": "This attempt cannot be completed."},
                    status=status.HTTP_409_CONFLICT,
                )

            steps, completed_codes, current_step = _procedure_progress(attempt)
            if not steps or current_step is not None:
                return Response(
                    {
                        "detail": "Complete every procedure step before submitting.",
                        "currentStep": ProcedureStepSerializer(current_step).data
                        if current_step
                        else None,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            evidence_events = list(attempt.events.all())
            incorrect_events = [
                event
                for event in evidence_events
                if event.event_type in {"incorrect_action", "tolerance_failed"}
            ]
            safety_errors = sum(
                event.payload.get("safetyCritical") is True for event in incorrect_events
            )
            attempt.score = attempt.grading_policy.score_events(evidence_events)
            attempt.status = (
                Attempt.Status.REQUIRES_REVIEW
                if attempt.grading_policy.requires_review_on_safety_error and safety_errors
                else Attempt.Status.COMPLETED
            )
            attempt.completed_at = timezone.now()
            attempt.resume_state = {
                "completedSteps": [
                    step["code"] for step in steps if step["code"] in completed_codes
                ],
                "currentStep": None,
            }
            attempt.save(
                update_fields=["score", "status", "completed_at", "resume_state", "updated_at"]
            )
            attempt.outcome = materialize_attempt_results(attempt, steps, evidence_events)
            attempt.save(update_fields=["outcome", "updated_at"])
            attempt._prefetched_objects_cache.pop("step_results", None)
            attempt._prefetched_objects_cache.pop("competency_results", None)
            _create_attempt_event(
                attempt,
                "attempt_completed",
                {
                    "score": int(attempt.score),
                    "outcome": attempt.outcome,
                    "incorrectActions": len(incorrect_events),
                    "scenarioVersion": attempt.scenario.version,
                    "gradingPolicyVersion": attempt.grading_policy.version,
                },
            )
            attempt._prefetched_objects_cache.pop("events", None)
            for statement in _xapi_statements(attempt):
                errors = validate_xapi_statement(statement)
                if errors:
                    raise DjangoValidationError({"xapi": errors})
                XApiDelivery.objects.get_or_create(
                    statement_id=statement["id"],
                    defaults={"attempt": attempt, "statement": statement},
                )
            _recommendation_for(attempt)
            membership = request.user.school_memberships.filter(is_active=True).first()
            record_audit_event(
                event_type="assessment.attempt_completed",
                actor=request.user,
                school=membership.school if membership else None,
                target=attempt,
                payload={
                    "score": int(attempt.score),
                    "outcome": attempt.outcome,
                    "scenarioVersion": attempt.scenario.version,
                    "gradingPolicyVersion": attempt.grading_policy.version,
                },
            )

        return Response({"attempt": AttemptDetailSerializer(attempt).data})

    @action(detail=True, methods=["post"])
    def abandon(self, request, pk=None):
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if attempt.status != Attempt.Status.IN_PROGRESS:
                return Response(
                    {"detail": "Only an active attempt can be ended."},
                    status=status.HTTP_409_CONFLICT,
                )
            attempt.status = Attempt.Status.ABANDONED
            attempt.completed_at = timezone.now()
            attempt.save(update_fields=["status", "completed_at", "updated_at"])
            _create_attempt_event(
                attempt,
                "attempt_abandoned",
                {
                    "completedSteps": len(attempt.resume_state.get("completedSteps", [])),
                    "evidencePreserved": True,
                },
            )
            membership = request.user.school_memberships.filter(is_active=True).first()
            record_audit_event(
                event_type="assessment.attempt_abandoned",
                actor=request.user,
                school=membership.school if membership else None,
                target=attempt,
                payload={"evidencePreserved": True},
            )
        return Response({"attempt": AttemptDetailSerializer(attempt).data})
