from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Assignment, Attempt, AttemptEvent, Competency, Lesson, ProcedureStep


class CompetencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Competency
        fields = ["id", "code", "title", "description", "mastery_threshold"]


class ProcedureStepSerializer(serializers.ModelSerializer):
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
        ]


class LessonSummarySerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    trade = serializers.CharField(source="course.trade", read_only=True)
    program = serializers.CharField(source="course.program.name", read_only=True, allow_null=True)
    module = serializers.CharField(source="module.title", read_only=True, allow_null=True)
    competencies = CompetencySerializer(many=True, read_only=True)
    procedure_steps = ProcedureStepSerializer(many=True, read_only=True)

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
            "course_title",
            "trade",
            "program",
            "module",
            "competencies",
            "procedure_steps",
        ]


class AttemptSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Attempt
        fields = [
            "id",
            "status",
            "score",
            "resume_state",
            "started_at",
            "completed_at",
            "updated_at",
        ]


class AttemptEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttemptEvent
        fields = ["sequence", "event_type", "payload", "occurred_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    lesson = LessonSummarySerializer(read_only=True)
    latest_attempt = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = ["id", "lesson", "due_at", "created_at", "latest_attempt"]

    @extend_schema_field(AttemptSummarySerializer(allow_null=True))
    def get_latest_attempt(self, obj) -> dict[str, object] | None:
        attempt = next(iter(obj.attempts.all()), None)
        return AttemptSummarySerializer(attempt).data if attempt else None


class AttemptDetailSerializer(AttemptSummarySerializer):
    assignment = AssignmentSerializer(read_only=True)
    events = AttemptEventSerializer(many=True, read_only=True)

    class Meta(AttemptSummarySerializer.Meta):
        fields = AttemptSummarySerializer.Meta.fields + ["assignment", "events"]


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


class InstructorAttemptEvidenceSerializer(serializers.ModelSerializer):
    learner = InstructorLearnerSerializer(read_only=True)
    lesson = InstructorLessonSerializer(source="assignment.lesson", read_only=True)
    completed_steps = serializers.SerializerMethodField()
    total_steps = serializers.SerializerMethodField()
    incorrect_actions = serializers.SerializerMethodField()
    safety_errors = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = [
            "id",
            "learner",
            "lesson",
            "status",
            "score",
            "completed_steps",
            "total_steps",
            "incorrect_actions",
            "safety_errors",
            "started_at",
            "completed_at",
            "updated_at",
        ]

    def get_completed_steps(self, obj) -> int:
        return len(obj.resume_state.get("completedSteps", []))

    def get_total_steps(self, obj) -> int:
        return len(list(obj.assignment.lesson.procedure_steps.all()))

    def get_incorrect_actions(self, obj) -> int:
        return sum(event.event_type == "incorrect_action" for event in obj.events.all())

    def get_safety_errors(self, obj) -> int:
        return sum(
            event.event_type == "incorrect_action" and event.payload.get("safetyCritical") is True
            for event in obj.events.all()
        )


class InstructorAttemptReviewSerializer(InstructorAttemptEvidenceSerializer):
    procedure_steps = serializers.SerializerMethodField()
    events = AttemptEventSerializer(many=True, read_only=True)

    class Meta(InstructorAttemptEvidenceSerializer.Meta):
        fields = InstructorAttemptEvidenceSerializer.Meta.fields + ["procedure_steps", "events"]

    @extend_schema_field(ProcedureStepSerializer(many=True))
    def get_procedure_steps(self, obj) -> list[dict[str, object]]:
        return ProcedureStepSerializer(
            obj.assignment.lesson.procedure_steps.all(),
            many=True,
        ).data


class InstructorMetricsSerializer(serializers.Serializer):
    learners = serializers.IntegerField()
    assignments = serializers.IntegerField()
    attempts = serializers.IntegerField()
    completedAttempts = serializers.IntegerField()
    inProgressAttempts = serializers.IntegerField()
    safetyErrors = serializers.IntegerField()


class InstructorOverviewSerializer(serializers.Serializer):
    metrics = InstructorMetricsSerializer()
    attempts = InstructorAttemptEvidenceSerializer(many=True)
