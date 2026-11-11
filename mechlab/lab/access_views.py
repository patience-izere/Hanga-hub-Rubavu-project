"""Joining a class by code, issuing sign-in slips, signing up alone, and asking to register."""

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import throttling
from .access import (
    generate_join_code,
    generate_pin,
    normalize_join_code,
    normalize_phone,
    open_school,
    pin_problem,
    sign_in_name_taken,
    split_name,
    unique_sign_in_name,
    valid_sign_in_name,
)
from .api_views import _user_payload
from .audit import record_audit_event
from .models import (
    Cohort,
    Enrollment,
    LearnerProfile,
    School,
    SchoolMembership,
    SchoolRegistrationRequest,
)
from .permissions import IsInstructorOrSchoolAdmin

HOUR = 3600
CLASS_JOIN_IP_LIMIT = 30
REGISTRATION_IP_LIMIT = 10
SCHOOL_REQUEST_IP_LIMIT = 5
MAX_CLASS_SIZE = 200
MAX_BULK_LEARNERS = 60


def _staff_school_ids(user):
    """Schools where the caller teaches or administers."""

    if user.is_superuser:
        return list(School.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        SchoolMembership.objects.filter(
            user=user,
            is_active=True,
            school__is_active=True,
            role__in=[SchoolMembership.Role.ADMIN, SchoolMembership.Role.INSTRUCTOR],
        ).values_list("school_id", flat=True)
    )


def _class_payload(cohort):
    return {
        "id": cohort.pk,
        "name": cohort.name,
        "schoolName": cohort.school.name,
        "joinCode": cohort.join_code or "",
        "isActive": cohort.is_active,
        "learners": [
            {
                "id": enrollment.learner_id,
                "name": enrollment.learner.get_full_name() or enrollment.learner.get_username(),
                "signInName": enrollment.learner.get_username(),
                "usesPin": bool(
                    getattr(getattr(enrollment.learner, "learner_profile", None), "uses_pin", False)
                ),
            }
            for enrollment in cohort.enrollments.all()
            if enrollment.status == Enrollment.Status.ACTIVE
        ],
    }


def _classes(school_ids):
    return (
        Cohort.objects.filter(school_id__in=school_ids)
        .select_related("school")
        .prefetch_related("enrollments__learner__learner_profile")
        .order_by("-is_active", "school__name", "name")
    )


def _create_pin_learner(cohort, first_name, last_name, *, sign_in_name=None, pin=None):
    """Create a learner who signs in with a name and PIN, enrolled in ``cohort``."""

    sign_in_name = sign_in_name or unique_sign_in_name(first_name, last_name)
    pin = pin or generate_pin()
    user = get_user_model().objects.create_user(
        username=sign_in_name,
        password=pin,
        first_name=first_name,
        last_name=last_name,
    )
    LearnerProfile.objects.create(user=user, uses_pin=True)
    SchoolMembership.objects.create(
        school=cohort.school, user=user, role=SchoolMembership.Role.LEARNER
    )
    Enrollment.objects.create(cohort=cohort, learner=user)
    return user, pin


class ClassAccessListView(APIView):
    """Classes the caller teaches, with the join code and who signs in with a PIN."""

    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(
            {
                "classes": [
                    _class_payload(item) for item in _classes(_staff_school_ids(request.user))
                ]
            }
        )


class ClassJoinCodeView(APIView):
    """Switch joining by code on (issuing a fresh code) or off for one class."""

    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(
        request=inline_serializer("ClassJoinCodeRequest", {"enabled": serializers.BooleanField()}),
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, pk):
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return Response(
                {"enabled": ["Send true to issue a new code or false to switch joining off."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            cohort = (
                Cohort.objects.select_for_update(of=("self",))
                .filter(pk=pk, school_id__in=_staff_school_ids(request.user))
                .select_related("school")
                .first()
            )
            if cohort is None:
                return Response({"detail": "Class not found."}, status=status.HTTP_404_NOT_FOUND)
            # Turning it on always issues a new code, so an old photo of the board stops working.
            cohort.join_code = generate_join_code() if enabled else None
            cohort.save()
            record_audit_event(
                event_type="cohort.join_code_issued" if enabled else "cohort.join_code_disabled",
                actor=request.user,
                school=cohort.school,
                target=cohort,
            )
        return Response(_class_payload(_classes([cohort.school_id]).get(pk=cohort.pk)))


class ClassBulkLearnersView(APIView):
    """Create sign-in slips for a class list: a sign-in name and a PIN for each learner."""

    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(
        request=inline_serializer(
            "ClassBulkLearnersRequest",
            {"names": serializers.ListField(child=serializers.CharField(max_length=300))},
        ),
        responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT},
    )
    def post(self, request, pk):
        names = request.data.get("names")
        if not isinstance(names, list) or not all(isinstance(item, str) for item in names):
            return Response(
                {"names": ["Send the class list as a list of names."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cleaned = [" ".join(item.split()) for item in names if item.strip()]
        if not cleaned:
            return Response(
                {"names": ["Add at least one learner name."]}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(cleaned) > MAX_BULK_LEARNERS:
            return Response(
                {"names": [f"Add at most {MAX_BULK_LEARNERS} learners at a time."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            cohort = (
                Cohort.objects.select_for_update(of=("self",))
                .filter(pk=pk, school_id__in=_staff_school_ids(request.user), is_active=True)
                .select_related("school")
                .first()
            )
            if cohort is None:
                return Response({"detail": "Class not found."}, status=status.HTTP_404_NOT_FOUND)
            current = cohort.enrollments.filter(status=Enrollment.Status.ACTIVE).count()
            if current + len(cleaned) > MAX_CLASS_SIZE:
                return Response(
                    {"detail": f"A class holds at most {MAX_CLASS_SIZE} learners."},
                    status=status.HTTP_409_CONFLICT,
                )
            slips = []
            for full_name in cleaned:
                first_name, last_name = split_name(full_name)
                user, pin = _create_pin_learner(cohort, first_name, last_name)
                slips.append({"name": full_name, "signInName": user.get_username(), "pin": pin})
            record_audit_event(
                event_type="membership.learners_created",
                actor=request.user,
                school=cohort.school,
                target=cohort,
                # Never the PINs: they are shown once to the person who created them.
                payload={"count": len(slips)},
            )
        return Response(
            {
                "slips": slips,
                "class": _class_payload(_classes([cohort.school_id]).get(pk=cohort.pk)),
            },
            status=status.HTTP_201_CREATED,
        )


class LearnerPinResetView(APIView):
    """Issue a new PIN to a learner who forgot theirs. Only PIN accounts can be reset this way."""

    permission_classes = [IsInstructorOrSchoolAdmin]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        membership = (
            SchoolMembership.objects.filter(
                user_id=pk,
                school_id__in=_staff_school_ids(request.user),
                role=SchoolMembership.Role.LEARNER,
                is_active=True,
            )
            .select_related("user", "school")
            .first()
        )
        if membership is None:
            return Response({"detail": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)
        user = membership.user
        profile = getattr(user, "learner_profile", None)
        # An instructor must not be able to take over an account protected by a password and an
        # email address; those are recovered by the learner through email.
        only_learner = (
            not user.is_staff
            and not user.school_memberships.exclude(role=SchoolMembership.Role.LEARNER).exists()
        )
        if profile is None or not profile.uses_pin or not only_learner:
            return Response(
                {
                    "detail": "This learner signs in with a password. They can reset it "
                    "themselves from the sign-in page."
                },
                status=status.HTTP_409_CONFLICT,
            )
        pin = generate_pin()
        user.set_password(pin)
        user.save(update_fields=["password"])
        throttling.clear("login-pin", user.get_username())
        record_audit_event(
            event_type="account.pin_reset",
            actor=request.user,
            school=membership.school,
            target=user,
        )
        return Response(
            {
                "name": user.get_full_name() or user.get_username(),
                "signInName": user.get_username(),
                "pin": pin,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class ClassJoinView(APIView):
    """A learner joins a class with the code on the board and picks their own PIN."""

    permission_classes = [AllowAny]

    def _cohort(self, code):
        normalized = normalize_join_code(code)
        if not normalized:
            return None
        return (
            Cohort.objects.filter(join_code=normalized, is_active=True, school__is_active=True)
            .select_related("school")
            .first()
        )

    def _throttled(self, request):
        address = throttling.client_ip(request)
        if throttling.record("class-join-ip", address, window=HOUR) > CLASS_JOIN_IP_LIMIT:
            return throttling.too_many(
                "Too many tries from this network. Wait a while, then try again.",
                code="class_join_throttled",
                retry_after=HOUR,
            )
        return None

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, code):
        limited = self._throttled(request)
        if limited:
            return limited
        cohort = self._cohort(code)
        if cohort is None:
            return Response(
                {"detail": "That class code is not active. Check it with your instructor."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"className": cohort.name, "schoolName": cohort.school.name})

    @extend_schema(
        request=inline_serializer(
            "ClassJoinRequest",
            {
                "firstName": serializers.CharField(max_length=150),
                "lastName": serializers.CharField(max_length=150),
                "pin": serializers.CharField(max_length=6),
                "phone": serializers.CharField(max_length=20, required=False, allow_blank=True),
            },
        ),
        responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT},
    )
    def post(self, request, code):
        if request.user.is_authenticated:
            return Response(
                {
                    "detail": "You are already signed in. Sign out first to join as a new learner.",
                    "code": "already_signed_in",
                },
                status=status.HTTP_409_CONFLICT,
            )
        limited = self._throttled(request)
        if limited:
            return limited
        first_name = " ".join(str(request.data.get("firstName") or "").split())[:150]
        last_name = " ".join(str(request.data.get("lastName") or "").split())[:150]
        pin = str(request.data.get("pin") or "")
        phone_text = str(request.data.get("phone") or "").strip()
        errors = {}
        if not first_name:
            errors["firstName"] = ["Enter your first name."]
        if not last_name:
            errors["lastName"] = ["Enter your family name."]
        problem = pin_problem(pin)
        if problem:
            errors["pin"] = [problem]
        sign_in_name = None
        if phone_text:
            sign_in_name = normalize_phone(phone_text)
            if sign_in_name is None:
                errors["phone"] = ["Enter the phone number with digits only, or leave it empty."]
            elif sign_in_name_taken(sign_in_name):
                errors["phone"] = [
                    "That phone number already has an account. Sign in with it instead."
                ]
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            cohort = self._cohort(code)
            if cohort is None:
                return Response(
                    {"detail": "That class code is not active. Check it with your instructor."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            cohort = Cohort.objects.select_for_update(of=("self",)).get(pk=cohort.pk)
            if cohort.enrollments.filter(status=Enrollment.Status.ACTIVE).count() >= MAX_CLASS_SIZE:
                return Response(
                    {"detail": "This class is full. Ask your instructor for help."},
                    status=status.HTTP_409_CONFLICT,
                )
            user, _ = _create_pin_learner(
                cohort, first_name, last_name, sign_in_name=sign_in_name, pin=pin
            )
            record_audit_event(
                event_type="membership.joined_by_class_code",
                actor=user,
                school=cohort.school,
                target=cohort,
            )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(
            {"signInName": user.get_username(), "user": _user_payload(request)},
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_protect, name="dispatch")
class OpenRegistrationView(APIView):
    """Sign up without a school. The account can practise the open catalogue straight away."""

    permission_classes = [AllowAny]

    @extend_schema(
        request=inline_serializer(
            "OpenRegistrationRequest",
            {
                "firstName": serializers.CharField(max_length=150),
                "lastName": serializers.CharField(max_length=150),
                "signInName": serializers.CharField(max_length=254),
                "password": serializers.CharField(max_length=128),
            },
        ),
        responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        if not settings.OPEN_REGISTRATION:
            return Response(
                {
                    "detail": "Signing up on your own is switched off here. Ask your school "
                    "for an invitation.",
                    "code": "registration_closed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.is_authenticated:
            return Response(
                {"detail": "You are already signed in.", "code": "already_signed_in"},
                status=status.HTTP_409_CONFLICT,
            )
        address = throttling.client_ip(request)
        if throttling.record("register-ip", address, window=HOUR) > REGISTRATION_IP_LIMIT:
            return throttling.too_many(
                "Too many new accounts from this network. Try again later.",
                code="registration_throttled",
                retry_after=HOUR,
            )
        first_name = " ".join(str(request.data.get("firstName") or "").split())[:150]
        last_name = " ".join(str(request.data.get("lastName") or "").split())[:150]
        identifier = str(request.data.get("signInName") or "").strip()
        password = str(request.data.get("password") or "")
        errors = {}
        if not first_name:
            errors["firstName"] = ["Enter your first name."]
        email = ""
        if "@" in identifier:
            email = identifier.casefold()
            try:
                serializers.EmailField().run_validation(email)
            except serializers.ValidationError:
                errors["signInName"] = ["Enter a valid email address."]
            username = email
        else:
            username = normalize_phone(identifier) or identifier.casefold()
            if not valid_sign_in_name(username):
                errors["signInName"] = [
                    "Use your email address, your phone number, or a name of 3 to 60 letters "
                    "and digits."
                ]
        if "signInName" not in errors and sign_in_name_taken(username):
            errors["signInName"] = ["That sign-in name is taken. Sign in, or choose another."]
        if not errors:
            candidate = get_user_model()(
                username=username, email=email, first_name=first_name, last_name=last_name
            )
            try:
                validate_password(password, user=candidate)
            except ValidationError as exc:
                errors["password"] = list(exc.messages)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            user = get_user_model().objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )
            LearnerProfile.objects.create(user=user)
            school = open_school()
            SchoolMembership.objects.create(
                school=school, user=user, role=SchoolMembership.Role.LEARNER
            )
            record_audit_event(
                event_type="account.self_registered", actor=user, school=school, target=user
            )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": _user_payload(request)}, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class SchoolRegistrationRequestView(APIView):
    """A school, garage or hub asks to use the platform; a platform administrator approves it."""

    permission_classes = [AllowAny]

    @extend_schema(
        request=inline_serializer(
            "SchoolRegistrationRequestInput",
            {
                "organisationName": serializers.CharField(max_length=180),
                "kind": serializers.ChoiceField(choices=School.Kind.choices, required=False),
                "district": serializers.CharField(max_length=120, required=False, allow_blank=True),
                "contactName": serializers.CharField(max_length=180),
                "email": serializers.EmailField(),
                "phone": serializers.CharField(max_length=40, required=False, allow_blank=True),
                "message": serializers.CharField(max_length=2000, required=False, allow_blank=True),
            },
        ),
        responses={status.HTTP_201_CREATED: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        address = throttling.client_ip(request)
        if throttling.record("school-request-ip", address, window=HOUR) > SCHOOL_REQUEST_IP_LIMIT:
            return throttling.too_many(
                "Too many requests from this network. Try again later.",
                code="school_request_throttled",
                retry_after=HOUR,
            )

        class Input(serializers.Serializer):
            organisationName = serializers.CharField(max_length=180)
            kind = serializers.ChoiceField(choices=School.Kind.choices, required=False)
            district = serializers.CharField(max_length=120, required=False, allow_blank=True)
            contactName = serializers.CharField(max_length=180)
            email = serializers.EmailField()
            phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
            message = serializers.CharField(max_length=2000, required=False, allow_blank=True)

        serializer = Input(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        record = SchoolRegistrationRequest.objects.create(
            organisation_name=values["organisationName"].strip(),
            kind=values.get("kind", School.Kind.SCHOOL),
            district=values.get("district", "").strip(),
            contact_name=values["contactName"].strip(),
            email=values["email"].casefold(),
            phone=values.get("phone", "").strip(),
            message=values.get("message", "").strip(),
        )
        record_audit_event(event_type="school.registration_requested", target=record)
        return Response(
            {
                "detail": "Thank you. We review every request and reply to the email address "
                "you gave."
            },
            status=status.HTTP_201_CREATED,
        )
