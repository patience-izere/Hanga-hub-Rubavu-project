from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import AssetFile, AssetPackage, Lesson, SimulationScenario
from .scenario_validation import validate_scenario_for_publication


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
    publicationChecks = serializers.SerializerMethodField()

    class Meta:
        model = SimulationScenario
        fields = [
            "id",
            "lesson",
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

    @extend_schema_field(serializers.DictField())
    def get_publicationChecks(self, obj):
        try:
            validate_scenario_for_publication(obj)
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
