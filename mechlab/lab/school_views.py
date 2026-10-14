from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .models import (
    AuditEvent,
    Cohort,
    Enrollment,
    InstructorProfile,
    LearnerProfile,
    Program,
    School,
    SchoolInvitation,
    SchoolMembership,
)
from .notifications import send_email_safely
from .permissions import IsSchoolAdmin
from .school_serializers import (
    AuditEventSerializer,
    AuditPageSerializer,
    DetailSerializer,
    SchoolCohortCreateSerializer,
    SchoolCohortListSerializer,
    SchoolCohortSerializer,
    SchoolCohortUpdateSerializer,
    SchoolInvitationAcceptSerializer,
    SchoolInvitationCreatedSerializer,
    SchoolInvitationCreateSerializer,
    SchoolInvitationPreviewSerializer,
    SchoolInvitationSerializer,
    SchoolMemberSerializer,
    SchoolMemberUpdateSerializer,
    SchoolOverviewSerializer,
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


def _end_sessions_for(user) -> int:
    """Sign a person out everywhere once they have no school left to work in."""

    ended = 0
    user_id = str(user.pk)
    for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if session.get_decoded().get("_auth_user_id") == user_id:
            session.delete()
            ended += 1
    return ended


def _invitation_for_token(token: str, *, lock: bool = False):
    token_hash = sha256(token.encode()).hexdigest()
    queryset = SchoolInvitation.objects.select_related("school", "created_by")
    if lock:
        queryset = queryset.select_for_update(of=("self",))
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
        values = serializer.validated_data
        is_active = values.get("isActive", membership.is_active)
        role = values.get("role", membership.role)
        if membership.user_id == request.user.pk and (not is_active or role != membership.role):
            return Response(
                {"detail": "Ask another administrator to change your own access or role."},
                status=status.HTTP_409_CONFLICT,
            )
        losing_admin = membership.role == SchoolMembership.Role.ADMIN and (
            not is_active or role != SchoolMembership.Role.ADMIN
        )
        if losing_admin and membership.is_active:
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
        with transaction.atomic():
            if role != membership.role:
                previous_role = membership.role
                membership.role = role
                membership.save(update_fields=["role"])
                if role == SchoolMembership.Role.LEARNER:
                    LearnerProfile.objects.get_or_create(user=membership.user)
                elif role == SchoolMembership.Role.INSTRUCTOR:
                    InstructorProfile.objects.get_or_create(user=membership.user)
                if previous_role == SchoolMembership.Role.LEARNER:
                    # Cohorts hold learners only; their attempts and results are kept.
                    Enrollment.objects.filter(
                        learner=membership.user,
                        cohort__school=membership.school,
                        status=Enrollment.Status.ACTIVE,
                    ).update(status=Enrollment.Status.WITHDRAWN)
                record_audit_event(
                    event_type="membership.role_changed",
                    actor=request.user,
                    school=membership.school,
                    target=membership,
                    payload={
                        "userId": membership.user_id,
                        "from": previous_role,
                        "to": role,
                    },
                )
            if is_active != membership.is_active:
                membership.is_active = is_active
                membership.save(update_fields=["is_active"])
                # Suspension is school-scoped. The platform-wide account switch
                # (User.is_active) belongs to platform administrators, so a school admin can
                # neither lock out a superuser nor re-enable an account the platform disabled.
                if (
                    not is_active
                    and not membership.user.school_memberships.filter(
                        is_active=True, school__is_active=True
                    ).exists()
                ):
                    _end_sessions_for(membership.user)
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
        raw_token = token_urlsafe(32)
        with transaction.atomic():
            SchoolInvitation.objects.filter(
                school=school,
                email__iexact=email,
                is_active=True,
                accepted_at__isnull=True,
            ).update(is_active=False)
            invitation = SchoolInvitation.objects.create(
                school=school,
                email=email,
                role=role,
                token_hash=sha256(raw_token.encode()).hexdigest(),
                created_by=request.user,
                expires_at=timezone.now() + timedelta(days=7),
            )
            record_audit_event(
                event_type="membership.invitation_created",
                actor=request.user,
                school=school,
                target=invitation,
                payload={"role": role},
            )
        accept_url = f"{settings.FRONTEND_URL}/join/{raw_token}"
        # The invitation stands even if mail fails: the administrator can share the link.
        email_sent = send_email_safely(
            f"Join {school.name} on OPedu",
            f"You were invited as {invitation.get_role_display()}. "
            f"Accept within seven days: {accept_url}",
            [email],
        )
        return Response(
            {
                "invitation": SchoolInvitationSerializer(invitation).data,
                "acceptUrl": accept_url,
                "emailSent": email_sent,
            },
            status=status.HTTP_201_CREATED,
        )


class SchoolInvitationDetailView(APIView):
    """Revoke a pending invitation before it is accepted."""

    permission_classes = [IsSchoolAdmin]

    @extend_schema(responses=SchoolInvitationSerializer)
    def delete(self, request, pk):
        invitation = SchoolInvitation.objects.filter(
            pk=pk, school_id__in=_admin_school_ids(request.user)
        ).first()
        if invitation is None:
            return Response({"detail": "Invitation not found."}, status=status.HTTP_404_NOT_FOUND)
        if invitation.accepted_at is not None:
            # Revoking an accepted invitation would imply removing the membership it created,
            # which is the member-deactivation path instead.
            return Response(
                {"detail": "This invitation was already accepted; suspend the member instead."},
                status=status.HTTP_409_CONFLICT,
            )
        invitation.is_active = False
        invitation.save(update_fields=["is_active"])
        record_audit_event(
            event_type="membership.invitation_revoked",
            actor=request.user,
            school=invitation.school,
            target=invitation,
            payload={"role": invitation.role},
        )
        return Response(SchoolInvitationSerializer(invitation).data)


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
                # Only someone holding the emailed token sees this, and it tells them whether to
                # sign in or create an account.
                "accountExists": get_user_model()
                .objects.filter(email__iexact=invitation.email)
                .exists(),
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
            existing = get_user_model().objects.filter(email__iexact=invitation.email).first()
            if request.user.is_authenticated:
                # Accepting while signed in adds the school to that account; it never switches
                # the browser to a different person.
                if (request.user.email or "").casefold() != invitation.email.casefold():
                    return Response(
                        {
                            "detail": "This invitation is for another email address. Sign out "
                            "and open the link again.",
                            "code": "invitation_email_mismatch",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                user = request.user
                if SchoolMembership.objects.filter(school=invitation.school, user=user).exists():
                    return Response(
                        {"detail": "You already belong to this school."},
                        status=status.HTTP_409_CONFLICT,
                    )
            elif existing is not None:
                return Response(
                    {
                        "detail": "You already have an OPedu account. Sign in with it, then open "
                        "this link again to join the school.",
                        "code": "account_exists",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            else:
                values = serializer.validated_data
                missing = [
                    field
                    for field in ("firstName", "lastName", "password")
                    if not values.get(field)
                ]
                if missing:
                    return Response(
                        {field: ["This field is required."] for field in missing},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                password = values["password"]
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
                    first_name=values["firstName"],
                    last_name=values["lastName"],
                )
            membership = SchoolMembership.objects.create(
                school=invitation.school,
                user=user,
                role=invitation.role,
            )
            if invitation.role == SchoolMembership.Role.LEARNER:
                LearnerProfile.objects.get_or_create(user=user)
            elif invitation.role == SchoolMembership.Role.INSTRUCTOR:
                InstructorProfile.objects.get_or_create(user=user)
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
            if not request.user.is_authenticated:
                login(request, user)
        return Response({"detail": "Invitation accepted."})


class SchoolAuditView(APIView):
    """Read-only governance trail for the administered schools.

    Every membership, invitation, assignment, content and grading mutation already appends an
    AuditEvent; until now those were reachable only through Django admin, which the person
    accountable for governance may not have access to.
    """

    permission_classes = [IsSchoolAdmin]

    @extend_schema(responses=AuditPageSerializer)
    def get(self, request):
        school_ids = _admin_school_ids(request.user)
        events = AuditEvent.objects.filter(school_id__in=school_ids).select_related(
            "actor", "school"
        )
        errors = {}

        def whole_number(name, default, maximum=None):
            raw = request.query_params.get(name, "").strip()
            if not raw:
                return default
            if not raw.isdigit() or int(raw) < 1:
                errors[name] = ["Use a whole number greater than zero."]
                return default
            return min(int(raw), maximum) if maximum else int(raw)

        event_type = request.query_params.get("eventType", "").strip()
        if event_type:
            events = events.filter(event_type=event_type)
        actor = whole_number("actor", None)
        if actor:
            events = events.filter(actor_id=actor)
        before = whole_number("before", None)
        if before:
            events = events.filter(id__lt=before)
        limit = whole_number("limit", 100, maximum=500)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        # Newest first by id, which also orders by time and makes ?before= a stable cursor.
        page = list(events.order_by("-id")[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response(
            {
                "events": AuditEventSerializer(page, many=True).data,
                "eventTypes": sorted(
                    AuditEvent.objects.filter(school_id__in=school_ids)
                    .values_list("event_type", flat=True)
                    .distinct()
                ),
                # Pass back as ?before= for the next, older page.
                "nextBefore": page[-1].pk if has_more else None,
            }
        )


class SchoolOverviewView(APIView):
    """Landing summary so an administrator is not sent to the instructor dashboard."""

    permission_classes = [IsSchoolAdmin]

    @extend_schema(responses=SchoolOverviewSerializer)
    def get(self, request):
        school_ids = _admin_school_ids(request.user)
        now = timezone.now()

        memberships = SchoolMembership.objects.filter(school_id__in=school_ids)
        members_by_role = {}
        suspended = 0
        for membership in memberships:
            if membership.is_active:
                members_by_role[membership.role] = members_by_role.get(membership.role, 0) + 1
            else:
                suspended += 1

        invitations = SchoolInvitation.objects.filter(school_id__in=school_ids, accepted_at=None)
        pending = invitations.filter(is_active=True, expires_at__gt=now).count()
        expired = invitations.filter(is_active=True, expires_at__lte=now).count()

        cohorts = [
            {
                "id": cohort.pk,
                "name": cohort.name,
                "code": cohort.code,
                "school": cohort.school.name,
                "learnerCount": cohort.enrollments.filter(status=Enrollment.Status.ACTIVE).count(),
            }
            for cohort in Cohort.objects.filter(
                school_id__in=school_ids, is_active=True
            ).select_related("school")
        ]

        recent = AuditEvent.objects.filter(school_id__in=school_ids).select_related(
            "actor", "school"
        )[:10]

        return Response(
            {
                "schools": [
                    {"id": school.pk, "name": school.name, "code": school.code}
                    for school in School.objects.filter(id__in=school_ids)
                ],
                "membersByRole": members_by_role,
                "pendingInvitations": pending,
                "expiredInvitations": expired,
                "suspendedMembers": suspended,
                "cohorts": cohorts,
                "recentAudit": AuditEventSerializer(recent, many=True).data,
            }
        )


def _person(user):
    return {"id": user.pk, "name": user.get_full_name() or user.get_username(), "email": user.email}


def _cohort_payload(cohort):
    return {
        "id": cohort.pk,
        "name": cohort.name,
        "code": cohort.code,
        "academicYear": cohort.academic_year,
        "isActive": cohort.is_active,
        "school": {"id": cohort.school_id, "name": cohort.school.name, "code": cohort.school.code},
        "programName": cohort.program.name,
        "learners": [
            _person(enrollment.learner)
            for enrollment in cohort.enrollments.all()
            if enrollment.status == Enrollment.Status.ACTIVE
        ],
    }


def _unique_code(model, school, text):
    base = slugify(text)[:50] or "group"
    code, suffix = base, 2
    while model.objects.filter(school=school, code=code).exists():
        code = f"{base}-{suffix}"
        suffix += 1
    return code


class SchoolCohortListView(APIView):
    """Cohorts (classes) and who is in them, so instructors can assign a lesson to a class.

    Cohorts used to exist only in Django admin, which school administrators usually cannot open.
    """

    permission_classes = [IsSchoolAdmin]

    def _cohorts(self, school_ids):
        return (
            Cohort.objects.filter(school_id__in=school_ids)
            .select_related("school", "program")
            .prefetch_related("enrollments__learner")
            .order_by("-is_active", "school__name", "name")
        )

    @extend_schema(responses=SchoolCohortListSerializer)
    def get(self, request):
        school_ids = _admin_school_ids(request.user)
        learners = (
            SchoolMembership.objects.filter(
                school_id__in=school_ids,
                role=SchoolMembership.Role.LEARNER,
                is_active=True,
            )
            .select_related("user")
            .order_by("user__first_name", "user__last_name", "user__email")
        )
        return Response(
            {
                "cohorts": [_cohort_payload(cohort) for cohort in self._cohorts(school_ids)],
                "programs": [
                    {"id": program.pk, "name": program.name, "schoolId": program.school_id}
                    for program in Program.objects.filter(school_id__in=school_ids, is_active=True)
                ],
                "learners": [
                    {**_person(item.user), "schoolId": item.school_id} for item in learners
                ],
            }
        )

    @extend_schema(
        request=SchoolCohortCreateSerializer,
        responses={status.HTTP_201_CREATED: SchoolCohortSerializer},
    )
    def post(self, request):
        serializer = SchoolCohortCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        school_ids = _admin_school_ids(request.user)
        school_id = values.get("schoolId")
        if school_id is None and len(school_ids) == 1:
            school_id = school_ids[0]
        if school_id not in school_ids:
            return Response(
                {"detail": "Select a school you administer."}, status=status.HTTP_403_FORBIDDEN
            )
        school = School.objects.get(pk=school_id)
        with transaction.atomic():
            program_name = values["programName"].strip()
            program = Program.objects.filter(school=school, name__iexact=program_name).first()
            if program is None:
                program = Program.objects.create(
                    school=school,
                    name=program_name,
                    code=_unique_code(Program, school, program_name),
                )
            cohort = Cohort.objects.create(
                school=school,
                program=program,
                name=values["name"].strip(),
                code=_unique_code(Cohort, school, values["name"]),
                academic_year=values.get("academicYear", "").strip(),
            )
            record_audit_event(
                event_type="cohort.created",
                actor=request.user,
                school=school,
                target=cohort,
                payload={"name": cohort.name, "program": program.name},
            )
        return Response(
            _cohort_payload(self._cohorts([school.pk]).get(pk=cohort.pk)),
            status=status.HTTP_201_CREATED,
        )


class SchoolCohortDetailView(APIView):
    permission_classes = [IsSchoolAdmin]

    @extend_schema(request=SchoolCohortUpdateSerializer, responses=SchoolCohortSerializer)
    def patch(self, request, pk):
        serializer = SchoolCohortUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        school_ids = _admin_school_ids(request.user)
        with transaction.atomic():
            cohort = (
                Cohort.objects.select_for_update(of=("self",))
                .filter(pk=pk, school_id__in=school_ids)
                .select_related("school")
                .first()
            )
            if cohort is None:
                return Response({"detail": "Cohort not found."}, status=status.HTTP_404_NOT_FOUND)
            changes = {}
            for key, field in (
                ("name", "name"),
                ("academicYear", "academic_year"),
                ("isActive", "is_active"),
            ):
                if key in values and getattr(cohort, field) != values[key]:
                    setattr(cohort, field, values[key])
                    changes[key] = values[key]
            if changes:
                cohort.save()
            if "learnerIds" in values:
                wanted = set(values["learnerIds"])
                eligible = set(
                    SchoolMembership.objects.filter(
                        school=cohort.school,
                        role=SchoolMembership.Role.LEARNER,
                        is_active=True,
                        user_id__in=wanted,
                    ).values_list("user_id", flat=True)
                )
                if eligible != wanted:
                    return Response(
                        {"learnerIds": ["Only active learners of this school can join it."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                current = {
                    enrollment.learner_id: enrollment for enrollment in cohort.enrollments.all()
                }
                added, removed = [], []
                for learner_id in sorted(wanted):
                    enrollment = current.get(learner_id)
                    if enrollment is None:
                        Enrollment.objects.create(cohort=cohort, learner_id=learner_id)
                        added.append(learner_id)
                    elif enrollment.status != Enrollment.Status.ACTIVE:
                        enrollment.status = Enrollment.Status.ACTIVE
                        enrollment.save(update_fields=["status"])
                        added.append(learner_id)
                for learner_id, enrollment in current.items():
                    if learner_id not in wanted and enrollment.status == Enrollment.Status.ACTIVE:
                        enrollment.status = Enrollment.Status.WITHDRAWN
                        enrollment.save(update_fields=["status"])
                        removed.append(learner_id)
                if added or removed:
                    changes["added"] = added
                    changes["removed"] = removed
            if changes:
                record_audit_event(
                    event_type="cohort.updated",
                    actor=request.user,
                    school=cohort.school,
                    target=cohort,
                    payload=changes,
                )
        refreshed = SchoolCohortListView()._cohorts([cohort.school_id]).get(pk=cohort.pk)
        return Response(_cohort_payload(refreshed))
