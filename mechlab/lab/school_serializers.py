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
    isActive = serializers.BooleanField()


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


class SchoolInvitationPreviewSerializer(serializers.Serializer):
    schoolName = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()
    expiresAt = serializers.DateTimeField()


class SchoolInvitationAcceptSerializer(serializers.Serializer):
    firstName = serializers.CharField(max_length=150)
    lastName = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
