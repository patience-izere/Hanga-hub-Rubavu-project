from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import SchoolInvitation, SchoolMembership


class SchoolSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()


class SchoolUserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.EmailField()


class SchoolMemberSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    school = serializers.SerializerMethodField()

    class Meta:
        model = SchoolMembership
        fields = ["id", "school", "user", "role", "is_active", "created_at"]

    @extend_schema_field(SchoolUserSummarySerializer)
    def get_user(self, obj) -> dict[str, object]:
        return {
            "id": obj.user_id,
            "name": obj.user.get_full_name() or obj.user.get_username(),
            "email": obj.user.email,
        }

    @extend_schema_field(SchoolSummarySerializer)
    def get_school(self, obj) -> dict[str, object]:
        return {"id": obj.school_id, "name": obj.school.name, "code": obj.school.code}


class SchoolMemberUpdateSerializer(serializers.Serializer):
    isActive = serializers.BooleanField(required=False)
    role = serializers.ChoiceField(choices=SchoolMembership.Role.choices, required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Change the role or the access status.")
        return attrs


class SchoolInvitationSerializer(serializers.ModelSerializer):
    school = serializers.SerializerMethodField()

    class Meta:
        model = SchoolInvitation
        fields = [
            "id",
            "school",
            "email",
            "role",
            "expires_at",
            "accepted_at",
            "is_active",
            "created_at",
        ]

    @extend_schema_field(SchoolSummarySerializer)
    def get_school(self, obj) -> dict[str, object]:
        return {"id": obj.school_id, "name": obj.school.name, "code": obj.school.code}


class SchoolInvitationCreateSerializer(serializers.Serializer):
    schoolId = serializers.IntegerField(required=False)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=SchoolMembership.Role.choices)


class SchoolInvitationCreatedSerializer(serializers.Serializer):
    invitation = SchoolInvitationSerializer()
    acceptUrl = serializers.URLField()
    emailSent = serializers.BooleanField()


class SchoolInvitationPreviewSerializer(serializers.Serializer):
    schoolName = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()
    expiresAt = serializers.DateTimeField()
    accountExists = serializers.BooleanField()


class SchoolInvitationAcceptSerializer(serializers.Serializer):
    """New people choose a name and password; people who already have an account sign in first
    and send nothing."""

    firstName = serializers.CharField(max_length=150, required=False)
    lastName = serializers.CharField(max_length=150, required=False)
    password = serializers.CharField(write_only=True, required=False)


class AuditPageSerializer(serializers.Serializer):
    events = serializers.ListField(child=serializers.DictField())
    eventTypes = serializers.ListField(child=serializers.CharField())
    nextBefore = serializers.IntegerField(allow_null=True)


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()


class AuditEventSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    eventType = serializers.CharField(source="event_type")
    actorName = serializers.SerializerMethodField()
    schoolName = serializers.SerializerMethodField()
    targetType = serializers.CharField(source="target_type")
    targetId = serializers.CharField(source="target_id")
    payload = serializers.DictField()
    occurredAt = serializers.DateTimeField(source="occurred_at")

    def get_actorName(self, obj) -> str:
        if obj.actor is None:
            return "System"
        return obj.actor.get_full_name() or obj.actor.get_username()

    def get_schoolName(self, obj) -> str:
        return obj.school.name if obj.school else ""


class SchoolOverviewSerializer(serializers.Serializer):
    """Counts a school administrator needs before drilling into any single list."""

    schools = serializers.ListField(child=serializers.DictField())
    membersByRole = serializers.DictField(child=serializers.IntegerField())
    pendingInvitations = serializers.IntegerField()
    expiredInvitations = serializers.IntegerField()
    suspendedMembers = serializers.IntegerField()
    cohorts = serializers.ListField(child=serializers.DictField())
    recentAudit = AuditEventSerializer(many=True)


class CohortLearnerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.CharField(allow_blank=True)


class SchoolCohortSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    code = serializers.CharField()
    academicYear = serializers.CharField(allow_blank=True)
    isActive = serializers.BooleanField()
    school = SchoolSummarySerializer()
    programName = serializers.CharField()
    learners = CohortLearnerSerializer(many=True)


class SchoolCohortListSerializer(serializers.Serializer):
    cohorts = SchoolCohortSerializer(many=True)
    programs = serializers.ListField(child=serializers.DictField())
    learners = serializers.ListField(child=serializers.DictField())


class SchoolCohortCreateSerializer(serializers.Serializer):
    schoolId = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=180)
    programName = serializers.CharField(max_length=180)
    academicYear = serializers.CharField(max_length=20, required=False, allow_blank=True)


class SchoolCohortUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180, required=False)
    academicYear = serializers.CharField(max_length=20, required=False, allow_blank=True)
    isActive = serializers.BooleanField(required=False)
    learnerIds = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=500
    )
