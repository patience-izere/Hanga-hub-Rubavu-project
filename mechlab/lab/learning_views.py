from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .learning_serializers import (
    AssignmentSerializer,
    AttemptDetailSerializer,
    AttemptSummarySerializer,
    InstructorAttemptEvidenceSerializer,
    InstructorAttemptReviewSerializer,
    InstructorOverviewSerializer,
    ProcedureStepSerializer,
)
from .models import Assignment, Attempt, AttemptEvent, Lesson, School, SchoolMembership
from .permissions import IsInstructorOrSchoolAdmin


def _next_sequence(attempt):
    latest = attempt.events.aggregate(latest=Max("sequence"))["latest"] or 0
    return latest + 1


def _procedure_progress(attempt):
    steps = list(attempt.assignment.lesson.procedure_steps.all())
    completed_codes = {
        event.payload.get("stepCode")
        for event in attempt.events.filter(event_type="step_completed")
    }
    current_step = next((step for step in steps if step.code not in completed_codes), None)
    return steps, completed_codes, current_step


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
        )
        .prefetch_related("assignment__lesson__procedure_steps", "events")
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
        safety_errors = sum(
            event.event_type == "incorrect_action" and event.payload.get("safetyCritical") is True
            for attempt in attempts
            for event in attempt.events.all()
        )
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
                },
                "attempts": InstructorAttemptEvidenceSerializer(attempts, many=True).data,
            }
        )


class InstructorAttemptReviewView(APIView):
    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses=InstructorAttemptReviewSerializer)
    def get(self, request, pk):
        attempt = _instructor_attempt_queryset(request.user).filter(pk=pk).first()
        if attempt is None:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(InstructorAttemptReviewSerializer(attempt).data)


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
            )
            .select_related("lesson", "lesson__course", "assigned_by")
            .prefetch_related("lesson__competencies", "lesson__procedure_steps", "attempts")
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        assignment = self.get_object()
        with transaction.atomic():
            assignment = Assignment.objects.select_for_update().get(pk=assignment.pk)
            attempt = assignment.attempts.filter(
                learner=request.user,
                status=Attempt.Status.IN_PROGRESS,
            ).first()
            created = attempt is None
            if created:
                attempt = Attempt.objects.create(assignment=assignment, learner=request.user)
                AttemptEvent.objects.create(
                    attempt=attempt,
                    sequence=1,
                    event_type="attempt_started",
                    payload={"lessonId": assignment.lesson_id},
                )
                membership = request.user.school_memberships.filter(is_active=True).first()
                record_audit_event(
                    event_type="assessment.attempt_started",
                    actor=request.user,
                    school=membership.school if membership else None,
                    target=attempt,
                    payload={"assignmentId": assignment.pk},
                )
        return Response(
            {"attempt": AttemptSummarySerializer(attempt).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
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
            )
            .prefetch_related(
                "assignment__lesson__competencies",
                "assignment__lesson__procedure_steps",
                "assignment__attempts",
                "events",
            )
        )

    @action(detail=True, methods=["post"], url_path="actions")
    def record_action(self, request, pk=None):
        action_code = request.data.get("action")
        metadata = request.data.get("metadata", {})
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

        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if attempt.status != Attempt.Status.IN_PROGRESS:
                return Response(
                    {"detail": "This attempt is no longer active."},
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

            is_correct = action_code == current_step.action_code
            event_type = "step_completed" if is_correct else "incorrect_action"
            payload = {
                "action": action_code,
                "expectedStepCode": current_step.code,
                "safetyCritical": current_step.safety_critical,
                "metadata": metadata,
            }
            if is_correct:
                payload.update({"stepCode": current_step.code, "points": current_step.points})
            AttemptEvent.objects.create(
                attempt=attempt,
                sequence=_next_sequence(attempt),
                event_type=event_type,
                payload=payload,
            )

            if is_correct:
                completed_codes.add(current_step.code)
                next_step = next((step for step in steps if step.code not in completed_codes), None)
                attempt.resume_state = {
                    "completedSteps": [step.code for step in steps if step.code in completed_codes],
                    "currentStep": next_step.code if next_step else None,
                }
                attempt.save(update_fields=["resume_state", "updated_at"])
                message = current_step.feedback
            else:
                next_step = current_step
                message = (
                    "Safety sequence interrupted. Follow the highlighted instruction before continuing."
                    if current_step.safety_critical
                    else "That action is out of sequence. Review the current instruction and try again."
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

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        with transaction.atomic():
            attempt = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if attempt.status == Attempt.Status.COMPLETED:
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

            incorrect_events = list(attempt.events.filter(event_type="incorrect_action"))
            penalty = sum(
                15 if event.payload.get("safetyCritical") else 5 for event in incorrect_events
            )
            attempt.score = max(0, 100 - penalty)
            attempt.status = Attempt.Status.COMPLETED
            attempt.completed_at = timezone.now()
            attempt.resume_state = {
                "completedSteps": [step.code for step in steps if step.code in completed_codes],
                "currentStep": None,
            }
            attempt.save(
                update_fields=["score", "status", "completed_at", "resume_state", "updated_at"]
            )
            AttemptEvent.objects.create(
                attempt=attempt,
                sequence=_next_sequence(attempt),
                event_type="attempt_completed",
                payload={"score": int(attempt.score), "incorrectActions": len(incorrect_events)},
            )
            membership = request.user.school_memberships.filter(is_active=True).first()
            record_audit_event(
                event_type="assessment.attempt_completed",
                actor=request.user,
                school=membership.school if membership else None,
                target=attempt,
                payload={"score": int(attempt.score)},
            )

        return Response({"attempt": AttemptDetailSerializer(attempt).data})
