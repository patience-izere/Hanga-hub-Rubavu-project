from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    PilotApproval,
    PilotIncident,
    PilotObservation,
    PilotRehearsal,
    PilotReview,
    PilotStudy,
)
from .pilot_validation import pilot_collection_errors, pilot_freeze_errors


class PilotStudySerializer(serializers.ModelSerializer):
    freezeErrors = serializers.SerializerMethodField()
    collectionErrors = serializers.SerializerMethodField()

    class Meta:
        model = PilotStudy
        fields = [
            "id",
            "school",
            "code",
            "title",
            "scenario",
            "cohort",
            "protocol_version",
            "consent_version",
            "instruments",
            "supported_devices",
            "analysis_plan",
            "thresholds",
            "protocol_snapshot",
            "status",
            "frozen_at",
            "collection_started_at",
            "collection_closed_at",
            "created_at",
            "updated_at",
            "freezeErrors",
            "collectionErrors",
        ]
        read_only_fields = [
            "id",
            "protocol_snapshot",
            "status",
            "frozen_at",
            "collection_started_at",
            "collection_closed_at",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_freezeErrors(self, obj):
        return pilot_freeze_errors(obj) if obj.status == PilotStudy.Status.DRAFT else []

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_collectionErrors(self, obj):
        return pilot_collection_errors(obj) if obj.status == PilotStudy.Status.FROZEN else []

    def validate(self, attrs):
        school = attrs.get("school", self.instance.school if self.instance else None)
        scenario = attrs.get("scenario", self.instance.scenario if self.instance else None)
        cohort = attrs.get("cohort", self.instance.cohort if self.instance else None)
        errors = {}
        if school and scenario and scenario.lesson.course.school_id != school.pk:
            errors["scenario"] = "The scenario must belong to the selected school."
        if school and cohort and cohort.school_id != school.pk:
            errors["cohort"] = "The cohort must belong to the selected school."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class PilotTransitionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["freeze", "start", "close"])


class PilotApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = PilotApproval
        fields = [
            "id",
            "domain",
            "status",
            "approver_name",
            "approver_role",
            "organization",
            "evidence_reference",
            "scope",
            "decision_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PilotObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PilotObservation
        fields = [
            "id",
            "participant_code",
            "instrument",
            "responses",
            "consent_version",
            "collected_at",
            "created_at",
        ]
        read_only_fields = fields


class PilotObservationInputSerializer(serializers.Serializer):
    instrument = serializers.ChoiceField(choices=PilotObservation.Instrument.choices)
    responses = serializers.DictField()
    consent_accepted = serializers.BooleanField(default=False)
    learner_id = serializers.IntegerField(min_value=1, required=False)
    collected_at = serializers.DateTimeField(required=False)


class PilotIncidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PilotIncident
        fields = [
            "id",
            "kind",
            "severity",
            "status",
            "summary",
            "resolution",
            "evidence_reference",
            "safety_critical",
            "ar_caused_grading_penalty",
            "occurred_at",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PilotRehearsalSerializer(serializers.ModelSerializer):
    class Meta:
        model = PilotRehearsal
        fields = [
            "id",
            "kind",
            "outcome",
            "facilitator",
            "participant_count",
            "evidence_reference",
            "notes",
            "completed_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PilotReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = PilotReview
        fields = [
            "id",
            "decision",
            "reviewer_name",
            "reviewer_role",
            "organization",
            "evidence_reference",
            "rationale",
            "limitations",
            "independent_confirmed",
            "decided_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PilotReportSerializer(serializers.Serializer):
    studyId = serializers.IntegerField()
    protocolVersion = serializers.CharField()
    status = serializers.CharField()
    expectedParticipants = serializers.IntegerField()
    observedParticipants = serializers.IntegerField()
    instrumentCounts = serializers.DictField()
    missingByInstrument = serializers.DictField()
    learning = serializers.DictField()
    transfer = serializers.DictField()
    acceptance = serializers.DictField()
    rendererParity = serializers.DictField()
    recognition = serializers.DictField()
    byDeviceTier = serializers.DictField()
    operations = serializers.DictField()
    qualitativeThemes = serializers.DictField()
    incidents = serializers.DictField()
    excludedRecords = serializers.DictField()
    gates = serializers.DictField()
    overallGate = serializers.ChoiceField(choices=["pass", "fail", "insufficient"])
    limitations = serializers.ListField(child=serializers.CharField())


class PilotOptionsSerializer(serializers.Serializer):
    schools = serializers.ListField(child=serializers.DictField())
    cohorts = serializers.ListField(child=serializers.DictField())
    scenarios = serializers.ListField(child=serializers.DictField())
