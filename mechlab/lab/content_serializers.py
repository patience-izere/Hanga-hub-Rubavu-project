from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import (
    AssetFile,
    AssetPackage,
    Competency,
    Course,
    GradingPolicy,
    Lesson,
    Module,
    SimulationScenario,
)
from .scenario_snapshots import normalize_definition
from .scenario_validation import validate_scenario_for_publication


class CompetencyOptionSerializer(serializers.ModelSerializer):
    masteryThreshold = serializers.IntegerField(
        source="mastery_threshold", required=False, min_value=1, max_value=100
    )

    class Meta:
        model = Competency
        fields = ["id", "code", "title", "description", "masteryThreshold"]
        read_only_fields = ["id"]


class ModuleOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ["id", "code", "title", "description", "order"]
        read_only_fields = ["id", "code", "order"]


class AuthoringCourseSerializer(serializers.ModelSerializer):
    schoolName = serializers.CharField(source="school.name", read_only=True, default="")
    modules = ModuleOptionSerializer(many=True, read_only=True)
    competencies = CompetencyOptionSerializer(many=True, read_only=True)
    lessonCount = serializers.IntegerField(source="lessons.count", read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "school",
            "schoolName",
            "title",
            "slug",
            "trade",
            "description",
            "modules",
            "competencies",
            "lessonCount",
        ]
        read_only_fields = ["id", "slug"]


class GradingPolicyOptionSerializer(serializers.ModelSerializer):
    passThreshold = serializers.IntegerField(source="pass_threshold", read_only=True)

    class Meta:
        model = GradingPolicy
        fields = ["id", "code", "version", "name", "passThreshold"]
        read_only_fields = fields


class LessonScenarioSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationScenario
        fields = ["id", "version", "title", "status", "updated_at"]
        read_only_fields = fields


class AuthoringLessonSerializer(serializers.ModelSerializer):
    courseTitle = serializers.CharField(source="course.title", read_only=True)
    safetyNotes = serializers.ListField(
        source="safety_notes",
        child=serializers.CharField(max_length=500),
        required=False,
        max_length=30,
    )
    objectives = serializers.ListField(
        child=serializers.CharField(max_length=500), required=False, max_length=30
    )
    estimatedMinutes = serializers.IntegerField(
        source="estimated_minutes", required=False, min_value=5, max_value=480
    )
    competencies = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Competency.objects.all(), required=False
    )
    contentVersion = serializers.IntegerField(source="content_version", read_only=True)
    authoredBy = serializers.IntegerField(source="authored_by_id", read_only=True, allow_null=True)
    authorName = serializers.SerializerMethodField()
    reviewNotes = serializers.CharField(source="review_notes", read_only=True)
    submittedAt = serializers.DateTimeField(source="submitted_at", read_only=True, allow_null=True)
    publishedAt = serializers.DateTimeField(source="published_at", read_only=True, allow_null=True)
    scenarios = LessonScenarioSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Lesson
        fields = [
            "id",
            "course",
            "courseTitle",
            "module",
            "title",
            "slug",
            "summary",
            "objectives",
            "safetyNotes",
            "estimatedMinutes",
            "language",
            "competencies",
            "status",
            "contentVersion",
            "authoredBy",
            "authorName",
            "reviewNotes",
            "submittedAt",
            "publishedAt",
            "scenarios",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "status", "updated_at"]

    @extend_schema_field(serializers.CharField())
    def get_authorName(self, obj):
        author = obj.authored_by
        return (author.get_full_name() or author.get_username()) if author else ""

    def validate_objectives(self, value):
        return [item.strip() for item in value if item.strip()]

    def validate_safetyNotes(self, value):
        return [item.strip() for item in value if item.strip()]

    def validate(self, attrs):
        course = attrs.get("course")
        if self.instance is not None and course is not None and course != self.instance.course:
            raise serializers.ValidationError({"course": "A lesson cannot move to another course."})
        course = course or (self.instance.course if self.instance else None)
        module = attrs.get("module")
        if module is not None and course is not None and module.course_id != course.pk:
            raise serializers.ValidationError(
                {"module": "Choose a module from the lesson's course."}
            )
        for competency in attrs.get("competencies", []):
            if course is not None and competency.course_id != course.pk:
                raise serializers.ValidationError(
                    {"competencies": "Choose competencies from the lesson's course."}
                )
        return attrs


class LessonWorkflowSerializer(serializers.ModelSerializer):
    contentVersion = serializers.IntegerField(source="content_version", read_only=True)
    authoredBy = serializers.IntegerField(source="authored_by_id", read_only=True, allow_null=True)
    reviewedBy = serializers.IntegerField(source="reviewed_by_id", read_only=True, allow_null=True)
    reviewNotes = serializers.CharField(source="review_notes", read_only=True)
    submittedAt = serializers.DateTimeField(source="submitted_at", read_only=True, allow_null=True)
    reviewedAt = serializers.DateTimeField(source="reviewed_at", read_only=True, allow_null=True)
    publishedAt = serializers.DateTimeField(source="published_at", read_only=True, allow_null=True)
    prerequisiteIds = serializers.PrimaryKeyRelatedField(
        source="prerequisites",
        many=True,
        read_only=True,
    )

    class Meta:
        model = Lesson
        fields = [
            "id",
            "title",
            "status",
            "language",
            "contentVersion",
            "authoredBy",
            "reviewedBy",
            "reviewNotes",
            "submittedAt",
            "reviewedAt",
            "publishedAt",
            "prerequisiteIds",
        ]


class LessonTransitionSerializer(serializers.Serializer):
    class Action:
        SUBMIT = "submit"
        APPROVE = "approve"
        PUBLISH = "publish"
        RETURN_TO_DRAFT = "return_to_draft"
        RETIRE = "retire"

    action = serializers.ChoiceField(
        choices=[
            (Action.SUBMIT, "Submit for review"),
            (Action.APPROVE, "Approve"),
            (Action.PUBLISH, "Publish"),
            (Action.RETURN_TO_DRAFT, "Return to draft"),
            (Action.RETIRE, "Retire"),
        ]
    )
    reviewNotes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ScenarioAuthoringSerializer(serializers.ModelSerializer):
    authoredBy = serializers.IntegerField(source="authored_by_id", read_only=True, allow_null=True)
    reviewedBy = serializers.IntegerField(source="reviewed_by_id", read_only=True, allow_null=True)
    reviewNotes = serializers.CharField(source="review_notes", read_only=True)
    submittedAt = serializers.DateTimeField(source="submitted_at", read_only=True, allow_null=True)
    reviewedAt = serializers.DateTimeField(source="reviewed_at", read_only=True, allow_null=True)
    lessonTitle = serializers.CharField(source="lesson.title", read_only=True)
    lessonStatus = serializers.CharField(source="lesson.status", read_only=True)
    authorName = serializers.SerializerMethodField()
    publicationChecks = serializers.SerializerMethodField()

    class Meta:
        model = SimulationScenario
        fields = [
            "id",
            "lesson",
            "lessonTitle",
            "lessonStatus",
            "authorName",
            "version",
            "title",
            "definition",
            "grading_policy",
            "asset_package",
            "status",
            "authoredBy",
            "reviewedBy",
            "reviewNotes",
            "submittedAt",
            "reviewedAt",
            "publicationChecks",
            "published_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "published_at", "created_at", "updated_at"]

    def validate(self, attrs):
        current = self.instance
        lesson = attrs.get("lesson")
        if current is not None and lesson is not None and lesson.pk != current.lesson_id:
            raise serializers.ValidationError(
                {
                    "lesson": "A scenario cannot move to another lesson. Create a new scenario instead."
                }
            )
        lesson = lesson or (current.lesson if current else None)
        if lesson is not None and "definition" in attrs:
            attrs["definition"] = normalize_definition(attrs["definition"], lesson)
        package = attrs.get("asset_package")
        if lesson is not None and package is not None:
            if package.course.school_id != lesson.course.school_id:
                raise serializers.ValidationError(
                    {"asset_package": "The asset package must belong to the lesson's school."}
                )
        candidate = SimulationScenario(
            lesson=attrs.get("lesson", current.lesson if current else None),
            version=attrs.get("version", current.version if current else 1),
            title=attrs.get("title", current.title if current else ""),
            definition=attrs.get("definition", current.definition if current else {}),
            grading_policy=attrs.get("grading_policy", current.grading_policy if current else None),
            asset_package=attrs.get("asset_package", current.asset_package if current else None),
            status=current.status if current else SimulationScenario.Status.DRAFT,
        )
        try:
            candidate.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        return attrs

    @extend_schema_field(serializers.CharField())
    def get_authorName(self, obj):
        author = obj.authored_by
        return (author.get_full_name() or author.get_username()) if author else ""

    @extend_schema_field(serializers.DictField())
    def get_publicationChecks(self, obj):
        try:
            validate_scenario_for_publication(obj, for_publish=False)
        except DjangoValidationError as error:
            messages = error.message_dict.get("publication", error.messages)
            return {"ready": False, "errors": messages}
        return {"ready": True, "errors": []}


class ScenarioTransitionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            ("submit", "Submit for review"),
            ("approve", "Approve"),
            ("return_to_draft", "Return to draft"),
            ("retire", "Retire"),
        ]
    )
    reviewNotes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class AssetFileAuthoringSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = AssetFile
        fields = [
            "id",
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
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_url(self, obj):
        return (
            obj.path if obj.path.startswith(("/", "http://", "https://")) else f"/media/{obj.path}"
        )


class AssetPackageAuthoringSerializer(serializers.ModelSerializer):
    files = AssetFileAuthoringSerializer(many=True, read_only=True)

    class Meta:
        model = AssetPackage
        fields = [
            "id",
            "course",
            "code",
            "version",
            "name",
            "manifest",
            "sha256",
            "total_byte_size",
            "status",
            "published_at",
            "files",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "sha256",
            "total_byte_size",
            "status",
            "published_at",
            "files",
            "created_at",
            "updated_at",
        ]

    def validate_course(self, value):
        if self.instance is not None and value.pk != self.instance.course_id:
            raise serializers.ValidationError(
                "An asset package cannot move to another course. Create a new package instead."
            )
        return value

    def create(self, validated_data):
        validated_data.setdefault("sha256", "0" * 64)
        return super().create(validated_data)


class AssetUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    role = serializers.SlugField(max_length=60)
    licenseSpdx = serializers.RegexField(r"^[A-Za-z0-9.+-]{2,64}$")
    sourceAttribution = serializers.CharField(max_length=2000)
    altText = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    transcript = serializers.CharField(required=False, allow_blank=True, max_length=10000)

    def validate(self, attrs):
        role = attrs["role"]
        mime_type = attrs["file"].content_type or ""
        if role in {"fallback-media", "thumbnail"} and not attrs.get("altText", "").strip():
            raise serializers.ValidationError("Accessible fallback images require altText.")
        if mime_type.startswith("video/") and not attrs.get("transcript", "").strip():
            raise serializers.ValidationError("Fallback video requires a transcript.")
        return attrs


class ContentHistoryEntrySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    eventType = serializers.CharField()
    summary = serializers.CharField()
    subject = serializers.CharField()
    actorName = serializers.CharField()
    reviewNotes = serializers.CharField(allow_blank=True)
    occurredAt = serializers.DateTimeField()
