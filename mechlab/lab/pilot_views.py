from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .audit import record_audit_event
from .models import (
    Cohort,
    Enrollment,
    PilotApproval,
    PilotObservation,
    PilotRehearsal,
    PilotReview,
    PilotStudy,
    ResearchConsentReceipt,
    School,
    SchoolMembership,
    SimulationScenario,
)
from .permissions import IsInstructorOrSchoolAdmin, has_active_school_role
from .pilot_analysis import build_pilot_report
from .pilot_instruments import validate_pilot_observation
from .pilot_serializers import (
    PilotApprovalSerializer,
    PilotIncidentSerializer,
    PilotObservationInputSerializer,
    PilotObservationSerializer,
    PilotOptionsSerializer,
    PilotRehearsalSerializer,
    PilotReportSerializer,
    PilotReviewSerializer,
    PilotStudySerializer,
    PilotTransitionSerializer,
)
from .pilot_validation import build_protocol_snapshot, pilot_collection_errors, pilot_freeze_errors
from .research import research_participant_code


def _pilot_school_ids(user):
    if user.is_superuser:
        return list(School.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        SchoolMembership.objects.filter(
            user=user,
            is_active=True,
            school__is_active=True,
            role__in=[SchoolMembership.Role.ADMIN, SchoolMembership.Role.INSTRUCTOR],
        ).values_list("school_id", flat=True)
    )


def _is_admin(user, school) -> bool:
    return user.is_superuser or has_active_school_role(
        user,
        [SchoolMembership.Role.ADMIN],
        school=school,
    )


def _validation_response(error):
    if hasattr(error, "message_dict"):
        return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": error.messages}, status=status.HTTP_400_BAD_REQUEST)


class PilotStudyViewSet(viewsets.ModelViewSet):
    queryset = PilotStudy.objects.none()
    serializer_class = PilotStudySerializer
    search_fields = ["code", "title", "protocol_version"]
    ordering_fields = ["created_at", "updated_at", "status"]
    ordering = ["-created_at"]

    def get_permissions(self):
        if self.action in {"list", "retrieve", "observations"}:
            return [IsAuthenticated()]
        return [IsInstructorOrSchoolAdmin()]

    def get_queryset(self):
        user = self.request.user
        school_ids = _pilot_school_ids(user)
        learner_cohorts = Enrollment.objects.filter(
            learner=user,
            status=Enrollment.Status.ACTIVE,
        ).values_list("cohort_id", flat=True)
        return (
            PilotStudy.objects.filter(
                Q(school_id__in=school_ids)
                | Q(cohort_id__in=learner_cohorts, status=PilotStudy.Status.COLLECTING)
            )
            .select_related(
                "school",
                "scenario",
                "scenario__lesson",
                "scenario__lesson__course",
                "scenario__grading_policy",
                "scenario__asset_package",
                "cohort",
            )
            .prefetch_related("approvals", "observations", "incidents", "rehearsals")
            .distinct()
        )

    def perform_create(self, serializer):
        school = serializer.validated_data["school"]
        if not _is_admin(self.request.user, school):
            raise PermissionDenied("A school administrator must create the pilot protocol.")
        study = serializer.save(created_by=self.request.user, status=PilotStudy.Status.DRAFT)
        record_audit_event(
            event_type="pilot.study_created",
            actor=self.request.user,
            school=study.school,
            target=study,
            payload={"protocolVersion": study.protocol_version},
        )

    def update(self, request, *args, **kwargs):
        study = self.get_object()
        if not _is_admin(request.user, study.school):
            raise PermissionDenied("A school administrator must edit the pilot protocol.")
        if study.status != PilotStudy.Status.DRAFT:
            return Response(
                {"detail": "A frozen pilot protocol is immutable."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        study = self.get_object()
        if not _is_admin(request.user, study.school):
            raise PermissionDenied("A school administrator must delete a draft pilot.")
        if study.status != PilotStudy.Status.DRAFT:
            return Response(
                {"detail": "A frozen pilot protocol cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @extend_schema(responses=PilotOptionsSerializer)
    @action(detail=False, methods=["get"], url_path="options")
    def options(self, request):
        school_ids = _pilot_school_ids(request.user)
        if not school_ids:
            raise PermissionDenied("Pilot configuration is restricted to school staff.")
        schools = School.objects.filter(id__in=school_ids).order_by("name")
        cohorts = self._cohorts_for_schools(school_ids)
        scenarios = self._scenarios_for_schools(school_ids)
        return Response(
            {
                "schools": [{"id": item.pk, "name": item.name} for item in schools],
                "cohorts": [
                    {
                        "id": item.pk,
                        "schoolId": item.school_id,
                        "name": item.name,
                        "code": item.code,
                        "learnerCount": item.enrollments.filter(
                            status=Enrollment.Status.ACTIVE
                        ).count(),
                    }
                    for item in cohorts
                ],
                "scenarios": [
                    {
                        "id": item.pk,
                        "schoolId": item.lesson.course.school_id,
                        "title": item.title,
                        "lessonTitle": item.lesson.title,
                        "version": item.version,
                        "assetPackage": item.asset_package.code if item.asset_package else None,
                    }
                    for item in scenarios
                ],
            }
        )

    @staticmethod
    def _cohorts_for_schools(school_ids):
        return Cohort.objects.filter(school_id__in=school_ids, is_active=True).prefetch_related(
            "enrollments"
        )

    @staticmethod
    def _scenarios_for_schools(school_ids):
        return SimulationScenario.objects.filter(
            lesson__course__school_id__in=school_ids,
            status=SimulationScenario.Status.PUBLISHED,
        ).select_related("lesson", "lesson__course", "asset_package")

    @extend_schema(request=PilotTransitionSerializer, responses=PilotStudySerializer)
    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, pk=None):
        input_serializer = PilotTransitionSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            study = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if not _is_admin(request.user, study.school):
                raise PermissionDenied("A school administrator must transition the pilot.")
            transition = input_serializer.validated_data["action"]
            now = timezone.now()
            if transition == "freeze":
                if study.status != PilotStudy.Status.DRAFT:
                    return self._conflict("Only a draft protocol can be frozen.")
                errors = pilot_freeze_errors(study)
                if errors:
                    return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
                study.protocol_snapshot = build_protocol_snapshot(study)
                study.status = PilotStudy.Status.FROZEN
                study.frozen_by = request.user
                study.frozen_at = now
            elif transition == "start":
                if study.status != PilotStudy.Status.FROZEN:
                    return self._conflict("Only a frozen protocol can start collection.")
                errors = pilot_collection_errors(study)
                if errors:
                    return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
                study.status = PilotStudy.Status.COLLECTING
                study.collection_started_at = now
            else:
                if study.status != PilotStudy.Status.COLLECTING:
                    return self._conflict("Only an active pilot can close collection.")
                study.status = PilotStudy.Status.CLOSED
                study.collection_closed_at = now
            study.save()
            transition_event = {
                "freeze": "pilot.study_frozen",
                "start": "pilot.study_started",
                "close": "pilot.study_closed",
            }[transition]
            record_audit_event(
                event_type=transition_event,
                actor=request.user,
                school=study.school,
                target=study,
                payload={"protocolVersion": study.protocol_version},
            )
        return Response(PilotStudySerializer(study).data)

    @extend_schema(
        request=PilotApprovalSerializer,
        responses=PilotApprovalSerializer(many=True),
    )
    @action(detail=True, methods=["get", "post"], url_path="approvals")
    def approvals(self, request, pk=None):
        study = self.get_object()
        if request.method == "GET":
            if study.school_id not in _pilot_school_ids(request.user):
                raise PermissionDenied("Pilot approvals are restricted to school staff.")
            return Response(PilotApprovalSerializer(study.approvals.all(), many=True).data)
        if not _is_admin(request.user, study.school):
            raise PermissionDenied("A school administrator must record approval evidence.")
        serializer = PilotApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        existing = study.approvals.filter(domain=serializer.validated_data["domain"]).first()
        if existing is not None and existing.status != PilotApproval.Status.PENDING:
            return self._conflict(
                "This approval decision is immutable; revise the pilot protocol for a new decision."
            )
        try:
            approval, _ = PilotApproval.objects.update_or_create(
                study=study,
                domain=serializer.validated_data["domain"],
                defaults={**serializer.validated_data, "recorded_by": request.user},
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        record_audit_event(
            event_type="pilot.approval_recorded",
            actor=request.user,
            school=study.school,
            target=study,
            payload={"domain": approval.domain, "status": approval.status},
        )
        return Response(PilotApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=PilotRehearsalSerializer,
        responses=PilotRehearsalSerializer(many=True),
    )
    @action(detail=True, methods=["get", "post"], url_path="rehearsals")
    def rehearsals(self, request, pk=None):
        study = self.get_object()
        if study.school_id not in _pilot_school_ids(request.user):
            raise PermissionDenied("Pilot rehearsal evidence is restricted to school staff.")
        if request.method == "GET":
            return Response(PilotRehearsalSerializer(study.rehearsals.all(), many=True).data)
        serializer = PilotRehearsalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rehearsal = PilotRehearsal.objects.create(
                study=study,
                **serializer.validated_data,
                recorded_by=request.user,
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        record_audit_event(
            event_type="pilot.rehearsal_recorded",
            actor=request.user,
            school=study.school,
            target=study,
            payload={"kind": rehearsal.kind, "outcome": rehearsal.outcome},
        )
        return Response(PilotRehearsalSerializer(rehearsal).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=PilotObservationInputSerializer,
        responses=PilotObservationSerializer(many=True),
    )
    @action(detail=True, methods=["get", "post"], url_path="observations")
    def observations(self, request, pk=None):
        study = self.get_object()
        school_staff = study.school_id in _pilot_school_ids(request.user)
        if request.method == "GET":
            if not school_staff:
                raise PermissionDenied("Pilot observations are restricted to school staff.")
            return Response(PilotObservationSerializer(study.observations.all(), many=True).data)
        if study.status != PilotStudy.Status.COLLECTING:
            return self._conflict("Pilot observations are accepted only during active collection.")
        if settings.RESEARCH_CONSENT_STATUS != "approved":
            return Response(
                {"detail": "Research collection is disabled until consent is approved."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if study.consent_version != settings.RESEARCH_CONSENT_VERSION:
            return Response(
                {"detail": "The frozen pilot consent is no longer current; collection is paused."},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = PilotObservationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        instrument = values["instrument"]
        learner_self_instruments = {
            PilotObservation.Instrument.SUS,
            PilotObservation.Instrument.TAM,
            PilotObservation.Instrument.LEARNER_INTERVIEW,
        }
        staff_learner_instruments = {
            PilotObservation.Instrument.PRE_TEST,
            PilotObservation.Instrument.POST_TEST,
            PilotObservation.Instrument.TRANSFER,
        }
        staff_self_instruments = {
            PilotObservation.Instrument.INSTRUCTOR_INTERVIEW,
            PilotObservation.Instrument.INSTRUCTOR_WORKLOAD,
        }

        if instrument in learner_self_instruments:
            enrolled = Enrollment.objects.filter(
                cohort=study.cohort,
                learner=request.user,
                status=Enrollment.Status.ACTIVE,
            ).exists()
            if not enrolled:
                raise PermissionDenied("Only an enrolled pilot learner may submit this instrument.")
            participant_user = request.user
            create_consent = True
        elif instrument in staff_learner_instruments:
            if not school_staff:
                raise PermissionDenied("A pilot instructor must record this instrument.")
            learner_id = values.get("learner_id")
            enrolled = Enrollment.objects.filter(
                cohort=study.cohort,
                learner_id=learner_id,
                status=Enrollment.Status.ACTIVE,
            ).exists()
            if not enrolled:
                return Response(
                    {"detail": "learner_id must identify an active pilot participant."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            participant_user = Enrollment.objects.get(
                cohort=study.cohort,
                learner_id=learner_id,
            ).learner
            create_consent = False
        elif instrument in staff_self_instruments:
            if not school_staff:
                raise PermissionDenied("A pilot instructor must submit this instrument.")
            participant_user = request.user
            create_consent = True
        else:
            return Response(
                {"detail": "Unsupported instrument."}, status=status.HTTP_400_BAD_REQUEST
            )

        participant_code = research_participant_code(study.school_id, participant_user.pk)
        scenario_version = str(study.scenario.version)
        if create_consent:
            if values["consent_accepted"] is not True:
                return Response(
                    {"detail": "Explicit current pilot consent is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            now = timezone.now()
            ResearchConsentReceipt.objects.update_or_create(
                school=study.school,
                participant_code=participant_code,
                consent_version=study.consent_version,
                scenario_version=scenario_version,
                defaults={
                    "status": ResearchConsentReceipt.Status.ACTIVE,
                    "consented_at": now,
                    "withdrawn_at": None,
                    "expires_at": now + timedelta(days=settings.RESEARCH_RETENTION_DAYS),
                },
            )
        elif not ResearchConsentReceipt.objects.filter(
            school=study.school,
            participant_code=participant_code,
            consent_version=study.consent_version,
            scenario_version=scenario_version,
            status=ResearchConsentReceipt.Status.ACTIVE,
            expires_at__gt=timezone.now(),
        ).exists():
            return Response(
                {"detail": "The learner has no active consent for this frozen pilot."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            normalized = validate_pilot_observation(instrument, values["responses"])
            if PilotObservation.objects.filter(
                study=study,
                participant_code=participant_code,
                instrument=instrument,
            ).exists():
                return self._conflict(
                    "This participant instrument is already recorded and is immutable."
                )
            observation = PilotObservation.objects.create(
                study=study,
                participant_code=participant_code,
                instrument=instrument,
                responses=normalized,
                consent_version=study.consent_version,
                recorded_by=request.user,
                collected_at=values.get("collected_at", timezone.now()),
            )
        except DjangoValidationError as error:
            return _validation_response(error)
        record_audit_event(
            event_type="pilot.observation_recorded",
            actor=request.user,
            school=study.school,
            target=study,
            payload={"instrument": instrument, "participantCode": participant_code},
        )
        return Response(
            PilotObservationSerializer(observation).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        request=PilotIncidentSerializer,
        responses=PilotIncidentSerializer(many=True),
    )
    @action(detail=True, methods=["get", "post"], url_path="incidents")
    def incidents(self, request, pk=None):
        study = self.get_object()
        if study.school_id not in _pilot_school_ids(request.user):
            raise PermissionDenied("Pilot incidents are restricted to school staff.")
        if request.method == "GET":
            return Response(PilotIncidentSerializer(study.incidents.all(), many=True).data)
        incident_id = request.data.get("id")
        existing = study.incidents.filter(pk=incident_id).first() if incident_id else None
        if incident_id and existing is None:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PilotIncidentSerializer(
            existing, data=request.data, partial=existing is not None
        )
        serializer.is_valid(raise_exception=True)
        try:
            incident = serializer.save(study=study, reported_by=request.user)
        except DjangoValidationError as error:
            return _validation_response(error)
        record_audit_event(
            event_type="pilot.incident_updated" if existing else "pilot.incident_recorded",
            actor=request.user,
            school=study.school,
            target=study,
            payload={"incidentId": incident.pk, "severity": incident.severity},
        )
        return Response(
            PilotIncidentSerializer(incident).data,
            status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
        )

    @extend_schema(responses=PilotReportSerializer)
    @action(detail=True, methods=["get"], url_path="report")
    def report(self, request, pk=None):
        study = self.get_object()
        if study.school_id not in _pilot_school_ids(request.user):
            raise PermissionDenied("Pilot reports are restricted to school staff.")
        return Response(build_pilot_report(study))

    @extend_schema(request=PilotReviewSerializer, responses=PilotReviewSerializer)
    @action(detail=True, methods=["get", "post"], url_path="review")
    def review(self, request, pk=None):
        study = self.get_object()
        existing = PilotReview.objects.filter(study=study).first()
        if request.method == "GET":
            if study.school_id not in _pilot_school_ids(request.user):
                raise PermissionDenied("Pilot reviews are restricted to school staff.")
            if existing is None:
                return Response({"detail": "No independent review is recorded."}, status=404)
            return Response(PilotReviewSerializer(existing).data)
        if not _is_admin(request.user, study.school):
            raise PermissionDenied("A school administrator must record the independent decision.")
        if study.status != PilotStudy.Status.CLOSED:
            return self._conflict("Collection must be closed before independent review.")
        if existing is not None:
            return self._conflict("The independent review is immutable once recorded.")
        serializer = PilotReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = build_pilot_report(study)
        if (
            serializer.validated_data["decision"] == PilotReview.Decision.EXPAND
            and report["overallGate"] != "pass"
        ):
            return Response(
                {"detail": "Expansion cannot be approved while pilot gates fail or lack evidence."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            with transaction.atomic():
                review = serializer.save(study=study, recorded_by=request.user)
                study.status = PilotStudy.Status.REVIEWED
                study.save(update_fields=["status", "updated_at"])
                record_audit_event(
                    event_type="pilot.independent_review_recorded",
                    actor=request.user,
                    school=study.school,
                    target=study,
                    payload={"decision": review.decision, "overallGate": report["overallGate"]},
                )
        except DjangoValidationError as error:
            return _validation_response(error)
        return Response(PilotReviewSerializer(review).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _conflict(detail):
        return Response({"detail": detail}, status=status.HTTP_409_CONFLICT)
