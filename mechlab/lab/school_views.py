from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .models import (
    InstructorProfile,
    LearnerProfile,
    School,
    SchoolInvitation,
    SchoolMembership,
)
from .permissions import IsSchoolAdmin
from .school_serializers import (
    DetailSerializer,
    SchoolInvitationAcceptSerializer,
    SchoolInvitationCreatedSerializer,
    SchoolInvitationCreateSerializer,
    SchoolInvitationPreviewSerializer,
    SchoolInvitationSerializer,
    SchoolMemberSerializer,
    SchoolMemberUpdateSerializer,
)


def _admin_school_ids(user):
    if user.is_superuser:
        return list(School.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        SchoolMembership.objects.filter(
            user=user,
            role=SchoolMembership.Role.ADMIN,
            is_active=True,
            school__is_active=True,
        ).values_list("school_id", flat=True)
    )


def _invitation_for_token(token: str, *, lock: bool = False):
    token_hash = sha256(token.encode()).hexdigest()
    queryset = SchoolInvitation.objects.select_related("school", "created_by")
    if lock:
        queryset = queryset.select_for_update()
    return queryset.filter(
        token_hash=token_hash,
        is_active=True,
        accepted_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).first()


class SchoolMemberListView(APIView):
    permission_classes = [IsSchoolAdmin]

    @extend_schema(responses=SchoolMemberSerializer(many=True))
    def get(self, request):
        memberships = (
            SchoolMembership.objects.filter(school_id__in=_admin_school_ids(request.user))
            .select_related("school", "user")
            .order_by("school__name", "user__first_name", "user__email")
        )
        return Response(SchoolMemberSerializer(memberships, many=True).data)


class SchoolMemberDetailView(APIView):
    permission_classes = [IsSchoolAdmin]

    @extend_schema(request=SchoolMemberUpdateSerializer, responses=SchoolMemberSerializer)
    def patch(self, request, pk):
        serializer = SchoolMemberUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = (
            SchoolMembership.objects.select_related("school", "user")
            .filter(pk=pk, school_id__in=_admin_school_ids(request.user))
            .first()
        )
        if membership is None:
            return Response({"detail": "Membership not found."}, status=status.HTTP_404_NOT_FOUND)
        is_active = serializer.validated_data["isActive"]
        if membership.user_id == request.user.pk and not is_active:
            return Response(
                {"detail": "You cannot deactivate your own school membership."},
                status=status.HTTP_409_CONFLICT,
            )
        if membership.role == SchoolMembership.Role.ADMIN and not is_active:
            active_admins = SchoolMembership.objects.filter(
                school=membership.school,
                role=SchoolMembership.Role.ADMIN,
                is_active=True,
            ).count()
            if active_admins <= 1:
                return Response(
                    {"detail": "A school must retain at least one active administrator."},
                    status=status.HTTP_409_CONFLICT,
                )
        membership.is_active = is_active
        membership.save(update_fields=["is_active"])
        should_activate_user = (
            is_active
            or membership.user.school_memberships.filter(is_active=True)
            .exclude(pk=membership.pk)
            .exists()
        )
        membership.user.is_active = should_activate_user
        membership.user.save(update_fields=["is_active"])
        record_audit_event(
            event_type="membership.activation_changed",
            actor=request.user,
            school=membership.school,
            target=membership,
            payload={"isActive": is_active, "userId": membership.user_id},
        )
        return Response(SchoolMemberSerializer(membership).data)


class SchoolInvitationListCreateView(APIView):
    permission_classes = [IsSchoolAdmin]

    @extend_schema(responses=SchoolInvitationSerializer(many=True))
    def get(self, request):
        invitations = SchoolInvitation.objects.filter(
            school_id__in=_admin_school_ids(request.user)
        ).select_related("school")
        return Response(SchoolInvitationSerializer(invitations, many=True).data)

    @extend_schema(
        request=SchoolInvitationCreateSerializer,
        responses={status.HTTP_201_CREATED: SchoolInvitationCreatedSerializer},
    )
    def post(self, request):
        serializer = SchoolInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school_ids = _admin_school_ids(request.user)
        school_id = serializer.validated_data.get("schoolId")
        if school_id is None and len(school_ids) == 1:
            school_id = school_ids[0]
        if school_id not in school_ids:
            return Response(
                {"detail": "Select a school you administer."},
                status=status.HTTP_403_FORBIDDEN,
            )
        school = School.objects.get(pk=school_id)
        email = serializer.validated_data["email"].casefold()
        role = serializer.validated_data["role"]
        if SchoolMembership.objects.filter(school=school, user__email__iexact=email).exists():
            return Response(
                {"detail": "This person already belongs to the school."},
                status=status.HTTP_409_CONFLICT,
            )
        SchoolInvitation.objects.filter(
            school=school,
            email__iexact=email,
            is_active=True,
            accepted_at__isnull=True,
        ).update(is_active=False)
        raw_token = token_urlsafe(32)
        invitation = SchoolInvitation.objects.create(
            school=school,
            email=email,
            role=role,
            token_hash=sha256(raw_token.encode()).hexdigest(),
            created_by=request.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        accept_url = f"{settings.FRONTEND_URL}/join/{raw_token}"
        send_mail(
            f"Join {school.name} on OPedu",
            f"You were invited as {invitation.get_role_display()}. Accept within seven days: {accept_url}",
            settings.DEFAULT_FROM_EMAIL,
            [email],
        )
        record_audit_event(
            event_type="membership.invitation_created",
            actor=request.user,
            school=school,
            target=invitation,
            payload={"email": email, "role": role},
        )
        return Response(
            {
                "invitation": SchoolInvitationSerializer(invitation).data,
                "acceptUrl": accept_url,
            },
            status=status.HTTP_201_CREATED,
        )


class SchoolInvitationAcceptView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=SchoolInvitationPreviewSerializer)
    def get(self, request, token):
        invitation = _invitation_for_token(token)
        if invitation is None:
            return Response(
                {"detail": "This invitation is invalid or expired."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "schoolName": invitation.school.name,
                "email": invitation.email,
                "role": invitation.get_role_display(),
                "expiresAt": invitation.expires_at,
            }
        )

    @extend_schema(request=SchoolInvitationAcceptSerializer, responses=DetailSerializer)
    def post(self, request, token):
        serializer = SchoolInvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            invitation = _invitation_for_token(token, lock=True)
            if invitation is None:
                return Response(
                    {"detail": "This invitation is invalid or expired."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if get_user_model().objects.filter(email__iexact=invitation.email).exists():
                return Response(
                    {
                        "detail": "An account already uses this email. Ask an administrator for help."
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            password = serializer.validated_data["password"]
            try:
                validate_password(password)
            except ValidationError as exc:
                return Response(
                    {"detail": " ".join(exc.messages), "errors": exc.messages},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user = get_user_model().objects.create_user(
                username=invitation.email,
                email=invitation.email,
                password=password,
                first_name=serializer.validated_data["firstName"],
                last_name=serializer.validated_data["lastName"],
            )
            membership = SchoolMembership.objects.create(
                school=invitation.school,
                user=user,
                role=invitation.role,
            )
            if invitation.role == SchoolMembership.Role.LEARNER:
                LearnerProfile.objects.create(user=user)
            elif invitation.role == SchoolMembership.Role.INSTRUCTOR:
                InstructorProfile.objects.create(user=user)
            invitation.accepted_at = timezone.now()
            invitation.is_active = False
            invitation.save(update_fields=["accepted_at", "is_active"])
            record_audit_event(
                event_type="membership.invitation_accepted",
                actor=user,
                school=invitation.school,
                target=membership,
                payload={"invitationId": invitation.pk, "role": invitation.role},
            )
            login(request, user)
        return Response({"detail": "Invitation accepted."})
