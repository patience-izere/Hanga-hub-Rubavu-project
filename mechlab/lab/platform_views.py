"""Platform administration in the app: organisations and their requests to join.

Before this, a school could only be created in the Django admin, so a fresh installation had
nowhere to put classes, courses or invitations.
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import throttling
from .access import _unique_school_code, approve_school_registration
from .audit import record_audit_event
from .models import ContactMessage, School, SchoolMembership, SchoolRegistrationRequest
from .notifications import email_is_configured, send_email_safely
from .permissions import IsPlatformAdministrator


class PlatformSchoolSerializer(serializers.ModelSerializer):
    kindLabel = serializers.CharField(source="get_kind_display", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    isOpen = serializers.BooleanField(source="is_open", read_only=True)
    researchEnabled = serializers.BooleanField(source="research_enabled", read_only=True)
    memberCount = serializers.IntegerField(read_only=True)
    adminCount = serializers.IntegerField(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = School
        fields = [
            "id",
            "name",
            "code",
            "kind",
            "kindLabel",
            "isActive",
            "isOpen",
            "researchEnabled",
            "memberCount",
            "adminCount",
            "createdAt",
        ]


class RegistrationRequestSerializer(serializers.ModelSerializer):
    organisationName = serializers.CharField(source="organisation_name")
    kindLabel = serializers.CharField(source="get_kind_display")
    contactName = serializers.CharField(source="contact_name")
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = SchoolRegistrationRequest
        fields = [
            "id",
            "organisationName",
            "kind",
            "kindLabel",
            "district",
            "contactName",
            "email",
            "phone",
            "message",
            "status",
            "createdAt",
        ]


class PlatformOverviewSerializer(serializers.Serializer):
    schools = PlatformSchoolSerializer(many=True)
    requests = RegistrationRequestSerializer(many=True)
    emailConfigured = serializers.BooleanField()


class SchoolCreateInput(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    kind = serializers.ChoiceField(choices=School.Kind.choices, required=False)
    joinAsAdministrator = serializers.BooleanField(required=False, default=True)

    def validate_name(self, value):
        name = " ".join(value.split())
        if School.objects.filter(name__iexact=name).exists():
            raise serializers.ValidationError("An organisation with this name already exists.")
        return name


def _schools():
    return School.objects.annotate(
        memberCount=Count("memberships", filter=Q(memberships__is_active=True), distinct=True),
        adminCount=Count(
            "memberships",
            filter=Q(
                memberships__is_active=True,
                memberships__role=SchoolMembership.Role.ADMIN,
            ),
            distinct=True,
        ),
    ).order_by("name")


class PlatformSchoolsView(APIView):
    """List organisations and pending requests, or create an organisation."""

    permission_classes = [IsPlatformAdministrator]

    @extend_schema(responses=PlatformOverviewSerializer)
    def get(self, request):
        pending = SchoolRegistrationRequest.objects.filter(
            status=SchoolRegistrationRequest.Status.PENDING
        ).order_by("created_at")
        return Response(
            {
                "schools": PlatformSchoolSerializer(_schools(), many=True).data,
                "requests": RegistrationRequestSerializer(pending, many=True).data,
                "emailConfigured": email_is_configured(),
            }
        )

    @extend_schema(
        request=SchoolCreateInput,
        responses={status.HTTP_201_CREATED: PlatformSchoolSerializer},
    )
    def post(self, request):
        serializer = SchoolCreateInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            school = School.objects.create(
                name=values["name"],
                code=_unique_school_code(values["name"]),
                kind=values.get("kind", School.Kind.SCHOOL),
            )
            if values.get("joinAsAdministrator", True):
                SchoolMembership.objects.create(
                    school=school, user=request.user, role=SchoolMembership.Role.ADMIN
                )
            record_audit_event(
                event_type="school.created",
                actor=request.user,
                school=school,
                target=school,
                payload={"kind": school.kind},
            )
        return Response(
            PlatformSchoolSerializer(_schools().get(pk=school.pk)).data,
            status=status.HTTP_201_CREATED,
        )


class SchoolUpdateInput(serializers.Serializer):
    name = serializers.CharField(max_length=180, required=False)
    kind = serializers.ChoiceField(choices=School.Kind.choices, required=False)
    isActive = serializers.BooleanField(required=False)
    researchEnabled = serializers.BooleanField(required=False)


class PlatformSchoolDetailView(APIView):
    """Rename an organisation, change its type, switch it off and on, or delete it when empty."""

    permission_classes = [IsPlatformAdministrator]

    @extend_schema(request=SchoolUpdateInput, responses=PlatformSchoolSerializer)
    def patch(self, request, pk):
        school = School.objects.filter(pk=pk).first()
        if school is None:
            return Response({"detail": "Organisation not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SchoolUpdateInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if "name" in values:
            name = " ".join(values["name"].split())
            if School.objects.filter(name__iexact=name).exclude(pk=school.pk).exists():
                return Response(
                    {"name": ["An organisation with this name already exists."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            values["name"] = name
        if values.get("isActive") is False and school.is_open:
            return Response(
                {
                    "isActive": [
                        "The open class is where self sign-ups go; it cannot be switched off."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        changed = {}
        for key, field in (
            ("name", "name"),
            ("kind", "kind"),
            ("isActive", "is_active"),
            ("researchEnabled", "research_enabled"),
        ):
            if key in values and getattr(school, field) != values[key]:
                setattr(school, field, values[key])
                changed[key] = values[key]
        if changed:
            school.save(
                update_fields=[
                    f
                    for k, f in (
                        ("name", "name"),
                        ("kind", "kind"),
                        ("isActive", "is_active"),
                        ("researchEnabled", "research_enabled"),
                    )
                    if k in changed
                ]
            )
            record_audit_event(
                event_type="school.updated",
                actor=request.user,
                school=school,
                target=school,
                payload=changed,
            )
        return Response(PlatformSchoolSerializer(_schools().get(pk=school.pk)).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        school = School.objects.filter(pk=pk).first()
        if school is None:
            return Response({"detail": "Organisation not found."}, status=status.HTTP_404_NOT_FOUND)
        others = school.memberships.exclude(user=request.user).exists()
        if school.is_open or others or school.courses.exists() or school.cohorts.exists():
            return Response(
                {
                    "detail": "This organisation has people, courses or classes, so it cannot be "
                    "deleted. Switch it off instead: nobody can use it, and its records are kept."
                },
                status=status.HTTP_409_CONFLICT,
            )
        record_audit_event(
            event_type="school.deleted",
            actor=request.user,
            payload={"schoolId": school.pk, "name": school.name},
        )
        school.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegistrationDecisionView(APIView):
    """Approve a registration (creating the organisation and inviting its contact) or decline."""

    permission_classes = [IsPlatformAdministrator]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            "RegistrationDecisionResult",
            {
                "request": RegistrationRequestSerializer(),
                "school": PlatformSchoolSerializer(required=False, allow_null=True),
                "acceptUrl": serializers.CharField(required=False),
                "emailSent": serializers.BooleanField(required=False),
            },
        ),
    )
    def post(self, request, pk, decision):
        record = SchoolRegistrationRequest.objects.filter(pk=pk).first()
        if record is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if record.status != SchoolRegistrationRequest.Status.PENDING:
            return Response(
                {"detail": "This request has already been decided."},
                status=status.HTTP_409_CONFLICT,
            )
        if decision == "approve":
            school, accept_url, email_sent = approve_school_registration(record, request.user)
            record.refresh_from_db()
            return Response(
                {
                    "request": RegistrationRequestSerializer(record).data,
                    "school": PlatformSchoolSerializer(_schools().get(pk=school.pk)).data,
                    "acceptUrl": accept_url,
                    "emailSent": email_sent,
                }
            )
        if decision == "decline":
            record.status = SchoolRegistrationRequest.Status.DECLINED
            record.reviewed_by = request.user
            record.reviewed_at = timezone.now()
            record.save(update_fields=["status", "reviewed_by", "reviewed_at"])
            record_audit_event(
                event_type="school.registration_declined", actor=request.user, target=record
            )
            return Response({"request": RegistrationRequestSerializer(record).data})
        return Response({"detail": "Unknown decision."}, status=status.HTTP_404_NOT_FOUND)


class ContactMessageSerializer(serializers.ModelSerializer):
    topicLabel = serializers.CharField(source="get_topic_display", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "organisation",
            "topic",
            "topicLabel",
            "message",
            "handled",
            "createdAt",
        ]
        read_only_fields = ["id", "handled"]


CONTACT_IP_LIMIT = 5


class ContactMessageView(APIView):
    """Public: send an enquiry. Platform administrators: read them."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [AllowAny()]
        return [IsPlatformAdministrator()]

    @extend_schema(responses=ContactMessageSerializer(many=True))
    def get(self, request):
        messages = ContactMessage.objects.all()[:200]
        return Response(ContactMessageSerializer(messages, many=True).data)

    @extend_schema(
        request=ContactMessageSerializer,
        responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        address = throttling.client_ip(request)
        if throttling.record("contact-ip", address, window=3600) > CONTACT_IP_LIMIT:
            return throttling.too_many(
                "Too many messages from this network. Try again in an hour.",
                code="contact_throttled",
                retry_after=3600,
            )
        serializer = ContactMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = serializer.save()
        if settings.OPEDU_CONTACT_EMAIL:
            send_email_safely(
                f"OPedu enquiry: {record.get_topic_display()}",
                f"From: {record.name} <{record.email}>\n"
                f"Organisation: {record.organisation or 'not given'}\n\n{record.message}\n",
                [settings.OPEDU_CONTACT_EMAIL],
            )
        return Response(
            {"detail": "Thank you. Your message reached the OPedu team; we reply by email."},
            status=status.HTTP_201_CREATED,
        )


class ContactMessageDetailView(APIView):
    """Mark an enquiry as handled, or not."""

    permission_classes = [IsPlatformAdministrator]

    @extend_schema(
        request=inline_serializer("ContactHandledInput", {"handled": serializers.BooleanField()}),
        responses=ContactMessageSerializer,
    )
    def patch(self, request, pk):
        record = ContactMessage.objects.filter(pk=pk).first()
        if record is None:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        record.handled = bool(request.data.get("handled", True))
        record.save(update_fields=["handled"])
        return Response(ContactMessageSerializer(record).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        deleted, _ = ContactMessage.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({"detail": "Message not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
