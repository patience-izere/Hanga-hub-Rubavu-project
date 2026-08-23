from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    AdaptiveRecommendation,
    AssetFile,
    AssetPackage,
    Assignment,
    Attempt,
    AttemptEvent,
    AttemptSyncAudit,
    Competency,
    CompetencyResult,
    GradingPolicy,
    InstructorFeedback,
    KnowledgeCheckSubmission,
    Lesson,
    ProcedureStep,
    ResearchSurveyResponse,
    SimulationScenario,
    StepResult,
)


class CompetencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Competency
        fields = [
            "id",
            "code",
            "title",
            "description",
            "curriculum_reference",
            "level",
            "evidence_rules",
            "mastery_criteria",
            "mastery_threshold",
        ]


class StepToleranceSnapshotSerializer(serializers.Serializer):
    code = serializers.SlugField(read_only=True)
    measurement = serializers.CharField(read_only=True)
    minimum_value = serializers.CharField(read_only=True)
    maximum_value = serializers.CharField(read_only=True)
    unit = serializers.CharField(read_only=True)


class AcceptableActionSnapshotSerializer(serializers.Serializer):
    action_code = serializers.SlugField(read_only=True)
    label = serializers.CharField(read_only=True)
    is_primary = serializers.BooleanField(read_only=True)
    tolerance = StepToleranceSnapshotSerializer(read_only=True, allow_null=True)


class StepHintSnapshotSerializer(serializers.Serializer):
    code = serializers.SlugField(read_only=True)
    order = serializers.IntegerField(read_only=True)
    text = serializers.CharField(read_only=True)
    points_penalty = serializers.IntegerField(read_only=True)


class ToolSnapshotSerializer(serializers.Serializer):
    code = serializers.SlugField(read_only=True)
    name = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)


class HazardSnapshotSerializer(serializers.Serializer):
    code = serializers.SlugField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    mitigation = serializers.CharField(read_only=True)
    severity = serializers.ChoiceField(
        choices=["low", "medium", "high", "critical"],
        read_only=True,
    )


class ProcedureStepSerializer(serializers.ModelSerializer):
    acceptable_actions = serializers.SerializerMethodField()
    hints = serializers.SerializerMethodField()
    tolerances = serializers.SerializerMethodField()
    tools = serializers.SerializerMethodField()
    hazards = serializers.SerializerMethodField()
    feedback_rules = serializers.SerializerMethodField()
    competency_codes = serializers.SerializerMethodField()

    class Meta:
        model = ProcedureStep
        fields = [
            "id",
            "order",
            "code",
            "title",
            "instruction",
            "action_code",
            "feedback",
            "safety_critical",
            "points",
            "metadata",
            "acceptable_actions",
            "hints",
            "tolerances",
            "tools",
            "hazards",
            "feedback_rules",
            "competency_codes",
        ]

    @staticmethod
    def _snapshot_value(obj, key, default):
        return obj.get(key, default) if isinstance(obj, dict) else default

    @extend_schema_field(AcceptableActionSnapshotSerializer(many=True))
    def get_acceptable_actions(self, obj) -> list[dict[str, object]]:
        return self._snapshot_value(obj, "acceptable_actions", [])

    @extend_schema_field(StepHintSnapshotSerializer(many=True))
    def get_hints(self, obj) -> list[dict[str, object]]:
        return self._snapshot_value(obj, "hints", [])

    @extend_schema_field(StepToleranceSnapshotSerializer(many=True))
    def get_tolerances(self, obj) -> list[dict[str, object]]:
        return self._snapshot_value(obj, "tolerances", [])

    @extend_schema_field(ToolSnapshotSerializer(many=True))
    def get_tools(self, obj) -> list[dict[str, object]]:
        return self._snapshot_value(obj, "tools", [])

    @extend_schema_field(HazardSnapshotSerializer(many=True))
    def get_hazards(self, obj) -> list[dict[str, object]]:
        return self._snapshot_value(obj, "hazards", [])

    @extend_schema_field(serializers.DictField(child=serializers.CharField()))
    def get_feedback_rules(self, obj) -> dict[str, str]:
        return self._snapshot_value(obj, "feedback_rules", {})

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_competency_codes(self, obj) -> list[str]:
        return self._snapshot_value(obj, "competency_codes", [])


class GradingPolicyReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingPolicy
        fields = [
            "code",
            "version",
            "algorithm",
            "base_score",
            "pass_threshold",
            "incorrect_action_penalty",
            "safety_critical_penalty",
            "requires_review_on_safety_error",
        ]


class AssetFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = AssetFile
        fields = [
            "path",
            "url",
            "mime_type",
            "byte_size",
            "sha256",
            "role",
            "license_spdx",
            "source_attribution",
            "metadata",
        ]

    def get_url(self, obj) -> str:
        if obj.path.startswith(("http://", "https://", "/")):
            return obj.path
        return f"/media/{obj.path.lstrip('/')}"


class AssetPackageSerializer(serializers.ModelSerializer):
    files = AssetFileSerializer(many=True, read_only=True)

    class Meta:
        model = AssetPackage
        fields = [
            "code",
            "version",
            "name",
            "manifest",
            "sha256",
            "total_byte_size",
            "files",
        ]


class SimulationScenarioSummarySerializer(serializers.ModelSerializer):
    grading_policy = GradingPolicyReferenceSerializer(read_only=True)
    asset_package = AssetPackageSerializer(read_only=True, allow_null=True)
    renderer_config = serializers.SerializerMethodField()

    class Meta:
        model = SimulationScenario
        fields = [
            "id",
            "version",
            "title",
            "grading_policy",
            "asset_package",
            "renderer_config",
        ]

    @extend_schema_field(serializers.DictField())
    def get_renderer_config(self, obj):
        return obj.definition.get("renderers", {})


class LessonPrerequisiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ["id", "title", "slug"]


class LessonSummarySerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    trade = serializers.CharField(source="course.trade", read_only=True)
    program = serializers.CharField(source="course.program.name", read_only=True, allow_null=True)
    module = serializers.CharField(source="module.title", read_only=True, allow_null=True)
    competencies = CompetencySerializer(many=True, read_only=True)
    prerequisites = LessonPrerequisiteSerializer(many=True, read_only=True)
    procedure_steps = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "slug",
            "summary",
            "objectives",
            "safety_notes",
            "estimated_minutes",
            "language",
            "content_version",
            "course_title",
            "trade",
            "program",
            "module",
            "competencies",
            "prerequisites",
            "procedure_steps",
        ]

    @extend_schema_field(ProcedureStepSerializer(many=True))
    def get_procedure_steps(self, obj) -> list[dict[str, object]]:
        scenario = self.context.get("scenario")
        if scenario is not None:
            return ProcedureStepSerializer(
                scenario.definition.get("steps", []),
                many=True,
            ).data
        return ProcedureStepSerializer(obj.procedure_steps.all(), many=True).data


class AttemptSummarySerializer(serializers.ModelSerializer):
    scenario_version = serializers.IntegerField(source="scenario.version", read_only=True)
    grading_policy_code = serializers.CharField(source="grading_policy.code", read_only=True)
    grading_policy_version = serializers.IntegerField(
        source="grading_policy.version",
        read_only=True,
    )

    class Meta:
        model = Attempt
        fields = [
            "id",
            "status",
            "outcome",
            "score",
            "scenario_version",
            "grading_policy_code",
            "grading_policy_version",
            "resume_state",
            "renderer_mode",
            "learning_mode",
            "capability_profile",
            "started_at",
            "completed_at",
            "updated_at",
        ]


class HintRequestSerializer(serializers.Serializer):
    hintCode = serializers.SlugField(required=False)


class HintSerializer(serializers.Serializer):
    code = serializers.SlugField(read_only=True)
    order = serializers.IntegerField(read_only=True)
    text = serializers.CharField(read_only=True)
    points_penalty = serializers.IntegerField(read_only=True)


class HintResponseSerializer(serializers.Serializer):
    hint = HintSerializer(read_only=True)
    attempt = AttemptSummarySerializer(read_only=True)


class AttemptEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttemptEvent
        fields = [
            "event_id",
            "sequence",
            "event_type",
            "schema_version",
            "activity_id",
            "renderer_mode",
            "payload",
            "occurred_at",
            "client_occurred_at",
            "received_at",
        ]


class AttemptEventInputSerializer(serializers.Serializer):
    eventId = serializers.UUIDField()
    eventType = serializers.ChoiceField(
        choices=[
            "renderer_selected",
            "device_capability",
            "ar_session_started",
            "ar_session_ended",
            "ar_permission_denied",
            "ar_marker_found",
            "ar_marker_lost",
            "ar_marker_mismatch",
            "ar_tracking_recovered",
            "ar_placement_confirmed",
            "ar_fallback_used",
            "asset_load_completed",
            "asset_load_failed",
            "performance_sample",
            "sync_state_changed",
        ]
    )
    rendererMode = serializers.ChoiceField(choices=Attempt.RendererMode.choices)
    occurredAt = serializers.DateTimeField()
    payload = serializers.DictField(required=False, default=dict)


class AttemptEventBatchSerializer(serializers.Serializer):
    events = AttemptEventInputSerializer(many=True, min_length=1, max_length=100)

    def validate_events(self, events):
        event_ids = [item["eventId"] for item in events]
        if len(event_ids) != len(set(event_ids)):
            raise serializers.ValidationError("Event IDs must be unique within a batch.")
        return events


class AttemptSyncAuditInputSerializer(serializers.Serializer):
    eventIds = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=2000,
    )
    pendingCount = serializers.IntegerField(min_value=0, max_value=100000)
    clientCreatedAt = serializers.DateTimeField()

    def validate_eventIds(self, values):
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Event IDs must be unique.")
        return values


class AttemptSyncAuditSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttemptSyncAudit
        fields = [
            "audit_id",
            "client_event_ids",
            "server_event_ids",
            "missing_event_ids",
            "pending_count",
            "passed",
            "client_created_at",
            "audited_at",
        ]


class RendererSelectionSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=Attempt.RendererMode.choices)
    learningMode = serializers.ChoiceField(
        choices=Attempt.LearningMode.choices,
        required=False,
    )
    capabilityProfile = serializers.DictField(required=False, default=dict)


class KnowledgeCheckSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeCheckSubmission
        fields = ["id", "answers", "score", "submitted_at"]
        read_only_fields = ["id", "score", "submitted_at"]


class InstructorFeedbackSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = InstructorFeedback
        fields = [
            "id",
            "author_name",
            "observation",
            "feedback",
            "is_published",
            "published_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author_name", "published_at", "created_at", "updated_at"]

    def get_author_name(self, obj) -> str:
        return obj.author.get_full_name() or obj.author.get_username()


class AdaptiveRecommendationSerializer(serializers.ModelSerializer):
    overridden_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AdaptiveRecommendation
        fields = [
            "id",
            "rule_version",
            "kind",
            "input_snapshot",
            "rationale",
            "confidence",
            "override_kind",
            "override_reason",
            "overridden_by_name",
            "created_at",
        ]

    def get_overridden_by_name(self, obj) -> str:
        if not obj.overridden_by_id:
            return ""
        return obj.overridden_by.get_full_name() or obj.overridden_by.get_username()


class RecommendationOverrideSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=AdaptiveRecommendation.Kind.choices)
    reason = serializers.CharField(min_length=10, max_length=2000)


class ResearchSurveyResponseSerializer(serializers.ModelSerializer):
    consent_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = ResearchSurveyResponse
        fields = [
            "id",
            "participant_code",
            "instrument",
            "responses",
            "consent_version",
            "consent_accepted",
            "scenario_version",
            "submitted_at",
        ]
        read_only_fields = ["id", "participant_code", "submitted_at"]

    def validate_consent_accepted(self, value):
        if value is not True:
            raise serializers.ValidationError("Explicit research consent is required.")
        return value

    def validate_consent_version(self, value):
        if value != settings.RESEARCH_CONSENT_VERSION:
            raise serializers.ValidationError("This consent text is stale; reload before deciding.")
        return value


class ResearchConsentPolicySerializer(serializers.Serializer):
    version = serializers.CharField()
    retention_days = serializers.IntegerField(min_value=1)
    status = serializers.ChoiceField(choices=["draft", "approved"])
    privacy_path = serializers.CharField()


class StepResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = StepResult
        fields = [
            "step_code",
            "outcome",
            "attempts_count",
            "hints_used",
            "duration_seconds",
            "achieved_points",
            "available_points",
            "tolerance_passed",
            "safety_violations",
            "evidence_sequences",
            "completed_at",
        ]


class CompetencyResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompetencyResult
        fields = [
            "competency_code",
            "achieved_points",
            "available_points",
            "mastery_percentage",
            "mastery_threshold",
            "mastery_state",
            "evidence",
            "created_at",
        ]


class AssignmentSerializer(serializers.ModelSerializer):
    lesson = serializers.SerializerMethodField()
    scenario = SimulationScenarioSummarySerializer(read_only=True)
    latest_attempt = serializers.SerializerMethodField()
    attempt_history = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "lesson",
            "scenario",
            "available_at",
            "due_at",
            "attempt_limit",
            "instructions",
            "created_at",
            "latest_attempt",
            "attempt_history",
        ]

    @extend_schema_field(LessonSummarySerializer)
    def get_lesson(self, obj) -> dict[str, object]:
        return LessonSummarySerializer(
            obj.lesson,
            context={**self.context, "scenario": obj.scenario},
        ).data

    @extend_schema_field(AttemptSummarySerializer(allow_null=True))
    def get_latest_attempt(self, obj) -> dict[str, object] | None:
        attempt = next(iter(obj.attempts.all()), None)
        return AttemptSummarySerializer(attempt).data if attempt else None

    @extend_schema_field(AttemptSummarySerializer(many=True))
    def get_attempt_history(self, obj) -> list[dict[str, object]]:
        return AttemptSummarySerializer(obj.attempts.all(), many=True).data


class AttemptDetailSerializer(AttemptSummarySerializer):
    assignment = AssignmentSerializer(read_only=True)
    events = AttemptEventSerializer(many=True, read_only=True)
    step_results = StepResultSerializer(many=True, read_only=True)
    competency_results = CompetencyResultSerializer(many=True, read_only=True)
    feedback = serializers.SerializerMethodField()
    recommendation = serializers.SerializerMethodField()

    class Meta(AttemptSummarySerializer.Meta):
        fields = AttemptSummarySerializer.Meta.fields + [
            "assignment",
            "events",
            "step_results",
            "competency_results",
            "feedback",
            "recommendation",
        ]

    @extend_schema_field(InstructorFeedbackSerializer(many=True))
    def get_feedback(self, obj) -> list[dict[str, object]]:
        return InstructorFeedbackSerializer(
            [item for item in obj.feedback.all() if item.is_published], many=True
        ).data

    @extend_schema_field(AdaptiveRecommendationSerializer(allow_null=True))
    def get_recommendation(self, obj) -> dict[str, object] | None:
        recommendation = next(iter(obj.recommendations.all()), None)
        return AdaptiveRecommendationSerializer(recommendation).data if recommendation else None


class InstructorLearnerSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.EmailField(read_only=True)

    def get_name(self, obj) -> str:
        return obj.get_full_name() or obj.get_username()


class InstructorLessonSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    courseTitle = serializers.CharField(source="course.title", read_only=True)
    trade = serializers.CharField(source="course.trade", read_only=True)
    program = serializers.CharField(source="course.program.name", read_only=True, allow_null=True)
    module = serializers.CharField(source="module.title", read_only=True, allow_null=True)
    language = serializers.CharField(read_only=True)
    contentVersion = serializers.IntegerField(source="content_version", read_only=True)


class InstructorAttemptEvidenceSerializer(serializers.ModelSerializer):
    learner = InstructorLearnerSerializer(read_only=True)
    lesson = InstructorLessonSerializer(source="assignment.lesson", read_only=True)
    completed_steps = serializers.SerializerMethodField()
    total_steps = serializers.SerializerMethodField()
    incorrect_actions = serializers.SerializerMethodField()
    safety_errors = serializers.SerializerMethodField()
    scenario_version = serializers.IntegerField(source="scenario.version", read_only=True)
    grading_policy_code = serializers.CharField(source="grading_policy.code", read_only=True)
    grading_policy_version = serializers.IntegerField(
        source="grading_policy.version",
        read_only=True,
    )
    due_at = serializers.DateTimeField(source="assignment.due_at", read_only=True, allow_null=True)
    is_overdue = serializers.SerializerMethodField()
    is_blocked = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = [
            "id",
            "learner",
            "lesson",
            "status",
            "outcome",
            "score",
            "scenario_version",
            "grading_policy_code",
            "grading_policy_version",
            "completed_steps",
            "total_steps",
            "incorrect_actions",
            "safety_errors",
            "due_at",
            "is_overdue",
            "is_blocked",
            "started_at",
            "completed_at",
            "updated_at",
        ]

    def get_completed_steps(self, obj) -> int:
        return len(obj.resume_state.get("completedSteps", []))

    def get_total_steps(self, obj) -> int:
        return len(obj.scenario.definition.get("steps", []))

    def get_incorrect_actions(self, obj) -> int:
        return sum(event.event_type == "incorrect_action" for event in obj.events.all())

    def get_safety_errors(self, obj) -> int:
        return sum(
            event.event_type == "incorrect_action" and event.payload.get("safetyCritical") is True
            for event in obj.events.all()
        )

    def get_is_overdue(self, obj) -> bool:
        return bool(
            obj.assignment.due_at
            and obj.assignment.due_at < timezone.now()
            and obj.status == Attempt.Status.IN_PROGRESS
        )

    def get_is_blocked(self, obj) -> bool:
        return bool(
            obj.status == Attempt.Status.IN_PROGRESS
            and not obj.resume_state.get("completedSteps")
            and obj.updated_at < timezone.now() - timedelta(days=7)
        )


class InstructorAttemptReviewSerializer(InstructorAttemptEvidenceSerializer):
    procedure_steps = serializers.SerializerMethodField()
    events = AttemptEventSerializer(many=True, read_only=True)
    step_results = StepResultSerializer(many=True, read_only=True)
    competency_results = CompetencyResultSerializer(many=True, read_only=True)
    feedback = InstructorFeedbackSerializer(many=True, read_only=True)
    recommendations = AdaptiveRecommendationSerializer(many=True, read_only=True)

    class Meta(InstructorAttemptEvidenceSerializer.Meta):
        fields = InstructorAttemptEvidenceSerializer.Meta.fields + [
            "procedure_steps",
            "events",
            "step_results",
            "competency_results",
            "feedback",
            "recommendations",
        ]

    @extend_schema_field(ProcedureStepSerializer(many=True))
    def get_procedure_steps(self, obj) -> list[dict[str, object]]:
        return ProcedureStepSerializer(
            obj.scenario.definition.get("steps", []),
            many=True,
        ).data


class InstructorMetricsSerializer(serializers.Serializer):
    learners = serializers.IntegerField()
    assignments = serializers.IntegerField()
    attempts = serializers.IntegerField()
    completedAttempts = serializers.IntegerField()
    inProgressAttempts = serializers.IntegerField()
    safetyErrors = serializers.IntegerField()
    overdueAttempts = serializers.IntegerField()
    requiresReview = serializers.IntegerField()
    failedAttempts = serializers.IntegerField()


class InstructorOverviewSerializer(serializers.Serializer):
    metrics = InstructorMetricsSerializer()
    attempts = InstructorAttemptEvidenceSerializer(many=True)
    competencies = serializers.ListField(child=serializers.DictField())
    operationalAnalytics = serializers.DictField()


class InstructorAssignmentCreateSerializer(serializers.Serializer):
    scenarioId = serializers.IntegerField(min_value=1)
    learnerIds = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
        max_length=100,
    )
    cohortIds = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
        max_length=20,
    )
    availableAt = serializers.DateTimeField(required=False, allow_null=True)
    dueAt = serializers.DateTimeField(required=False, allow_null=True)
    attemptLimit = serializers.IntegerField(min_value=1, max_value=20, default=3)
    instructions = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs["learnerIds"] and not attrs["cohortIds"]:
            raise serializers.ValidationError("Select at least one learner or cohort.")
        if (
            attrs.get("availableAt")
            and attrs.get("dueAt")
            and attrs["dueAt"] < attrs["availableAt"]
        ):
            raise serializers.ValidationError("The due date cannot be before availability.")
        return attrs


class InstructorAssignmentOptionsSerializer(serializers.Serializer):
    learners = serializers.ListField(child=serializers.DictField())
    cohorts = serializers.ListField(child=serializers.DictField())
    scenarios = serializers.ListField(child=serializers.DictField())


class InstructorAssignmentCreateResponseSerializer(serializers.Serializer):
    assignmentIds = serializers.ListField(child=serializers.IntegerField())
    created = serializers.IntegerField()
    existing = serializers.IntegerField()
