import hashlib
from pathlib import PurePosixPath

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .asset_validation import package_publication_errors, validate_asset_bytes
from .audit import record_audit_event
from .content_serializers import (
    AssetPackageAuthoringSerializer,
    AssetUploadSerializer,
    LessonTransitionSerializer,
    LessonWorkflowSerializer,
    ScenarioAuthoringSerializer,
    ScenarioTransitionSerializer,
)
from .models import AssetFile, AssetPackage, Lesson, School, SchoolMembership, SimulationScenario
from .permissions import IsContentAuthorOrSchoolAdmin, has_active_school_role
from .scenario_validation import validate_scenario_for_publication


def _content_school_ids(user):
    if user.is_superuser:
        return list(School.objects.filter(is_active=True).values_list("id", flat=True))
    return list(
        SchoolMembership.objects.filter(
            user=user,
            is_active=True,
            school__is_active=True,
            role__in=[SchoolMembership.Role.ADMIN, SchoolMembership.Role.CONTENT_AUTHOR],
        ).values_list("school_id", flat=True)
    )


class LessonTransitionView(APIView):
    permission_classes = [IsContentAuthorOrSchoolAdmin]

    @extend_schema(
        request=LessonTransitionSerializer,
        responses={status.HTTP_200_OK: LessonWorkflowSerializer},
    )
    def post(self, request, pk):
        serializer = LessonTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]
        review_notes = serializer.validated_data.get("reviewNotes", "").strip()

        with transaction.atomic():
            lesson = (
                Lesson.objects.select_for_update()
                .select_related("course", "course__school")
                .prefetch_related("prerequisites")
                .filter(pk=pk, course__school_id__in=_content_school_ids(request.user))
                .first()
            )
            if lesson is None:
                return Response(
                    {"detail": "Lesson not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            school = lesson.course.school
            is_admin = request.user.is_superuser or has_active_school_role(
                request.user,
                [SchoolMembership.Role.ADMIN],
                school=school,
            )
            if lesson.authored_by_id not in {None, request.user.pk} and not is_admin:
                return Response(
                    {
                        "detail": "Only this lesson's author or a school administrator may change it."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            previous_status = lesson.status
            now = timezone.now()
            if action == LessonTransitionSerializer.Action.SUBMIT:
                if lesson.status != Lesson.Status.DRAFT:
                    return self._conflict("Only a draft lesson can be submitted for review.")
                lesson.status = Lesson.Status.REVIEW
                lesson.authored_by = lesson.authored_by or request.user
                lesson.submitted_at = now
                lesson.reviewed_by = None
                lesson.reviewed_at = None
                lesson.review_notes = ""
            elif action == LessonTransitionSerializer.Action.APPROVE:
                if not is_admin:
                    return self._forbidden_reviewer()
                if lesson.status != Lesson.Status.REVIEW:
                    return self._conflict("Only a lesson in review can be approved.")
                lesson.status = Lesson.Status.APPROVED
                lesson.reviewed_by = request.user
                lesson.reviewed_at = now
                lesson.review_notes = review_notes
            elif action == LessonTransitionSerializer.Action.PUBLISH:
                if not is_admin:
                    return self._forbidden_reviewer()
                if lesson.status != Lesson.Status.APPROVED:
                    return self._conflict("Only an approved lesson can be published.")
                lesson.status = Lesson.Status.PUBLISHED
                lesson.published_at = now
            elif action == LessonTransitionSerializer.Action.RETURN_TO_DRAFT:
                if not is_admin:
                    return self._forbidden_reviewer()
                if lesson.status not in {Lesson.Status.REVIEW, Lesson.Status.APPROVED}:
                    return self._conflict(
                        "Only a lesson in review or approved can return to draft."
                    )
                if not review_notes:
                    return Response(
                        {"detail": "Review notes are required when returning a lesson to draft."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lesson.status = Lesson.Status.DRAFT
                lesson.reviewed_by = request.user
                lesson.reviewed_at = now
                lesson.review_notes = review_notes
                lesson.submitted_at = None
                lesson.published_at = None
            elif action == LessonTransitionSerializer.Action.RETIRE:
                if not is_admin:
                    return self._forbidden_reviewer()
                if lesson.status != Lesson.Status.PUBLISHED:
                    return self._conflict("Only a published lesson can be retired.")
                lesson.status = Lesson.Status.RETIRED

            lesson.save()
            record_audit_event(
                event_type=f"content.lesson_{action}",
                actor=request.user,
                school=school,
                target=lesson,
                payload={
                    "fromStatus": previous_status,
                    "toStatus": lesson.status,
                    "contentVersion": lesson.content_version,
                },
            )
        return Response(LessonWorkflowSerializer(lesson).data)

    @staticmethod
    def _conflict(detail):
        return Response({"detail": detail}, status=status.HTTP_409_CONFLICT)

    @staticmethod
    def _forbidden_reviewer():
        return Response(
            {"detail": "A school administrator must review this transition."},
            status=status.HTTP_403_FORBIDDEN,
        )


class ScenarioAuthoringViewSet(viewsets.ModelViewSet):
    queryset = SimulationScenario.objects.none()
    serializer_class = ScenarioAuthoringSerializer
    permission_classes = [IsContentAuthorOrSchoolAdmin]
    search_fields = ["title", "lesson__title", "lesson__course__title"]
    ordering_fields = ["updated_at", "version", "title"]
    ordering = ["lesson__title", "-version"]

    def get_queryset(self):
        return SimulationScenario.objects.filter(
            lesson__course__school_id__in=_content_school_ids(self.request.user)
        ).select_related("lesson", "lesson__course", "grading_policy", "asset_package")

    def perform_create(self, serializer):
        lesson = serializer.validated_data["lesson"]
        if lesson.course.school_id not in _content_school_ids(self.request.user):
            raise PermissionDenied("The lesson must belong to your active school.")
        scenario = serializer.save(
            status=SimulationScenario.Status.DRAFT,
            authored_by=self.request.user,
        )
        record_audit_event(
            event_type="content.scenario_created",
            actor=self.request.user,
            school=lesson.course.school,
            target=scenario,
            payload={"version": scenario.version},
        )

    def update(self, request, *args, **kwargs):
        if self.get_object().status != SimulationScenario.Status.DRAFT:
            return Response(
                {"detail": "Published or retired scenario versions are immutable; clone a draft."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().status != SimulationScenario.Status.DRAFT:
            return Response(
                {"detail": "Published or retired scenario versions cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        with transaction.atomic():
            scenario = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            school = scenario.lesson.course.school
            if not has_active_school_role(
                request.user,
                [SchoolMembership.Role.ADMIN],
                school=school,
            ):
                return Response(
                    {"detail": "A school administrator must publish scenario versions."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if scenario.status != SimulationScenario.Status.APPROVED:
                return Response(
                    {"detail": "Only an approved scenario can be published."},
                    status=status.HTTP_409_CONFLICT,
                )
            try:
                validate_scenario_for_publication(scenario)
            except DjangoValidationError as error:
                return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
            scenario.status = SimulationScenario.Status.PUBLISHED
            try:
                scenario.save()
            except DjangoValidationError as error:
                return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
            record_audit_event(
                event_type="content.scenario_published",
                actor=request.user,
                school=school,
                target=scenario,
                payload={"version": scenario.version},
            )
        return Response(ScenarioAuthoringSerializer(scenario).data)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        serializer = ScenarioTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transition = serializer.validated_data["action"]
        review_notes = serializer.validated_data.get("reviewNotes", "").strip()
        with transaction.atomic():
            scenario = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            school = scenario.lesson.course.school
            is_admin = request.user.is_superuser or has_active_school_role(
                request.user,
                [SchoolMembership.Role.ADMIN],
                school=school,
            )
            previous_status = scenario.status
            now = timezone.now()
            if transition == "submit":
                if scenario.status != SimulationScenario.Status.DRAFT:
                    return self._conflict("Only a draft scenario can be submitted for review.")
                if scenario.authored_by_id not in {None, request.user.pk} and not is_admin:
                    return Response(
                        {
                            "detail": "Only this scenario's author or an administrator may submit it."
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                scenario.status = SimulationScenario.Status.REVIEW
                scenario.authored_by = scenario.authored_by or request.user
                scenario.submitted_at = now
                scenario.reviewed_by = None
                scenario.reviewed_at = None
                scenario.review_notes = ""
            elif transition == "approve":
                if not is_admin:
                    return self._forbidden_reviewer()
                if scenario.status != SimulationScenario.Status.REVIEW:
                    return self._conflict("Only a scenario in review can be approved.")
                try:
                    validate_scenario_for_publication(scenario)
                except DjangoValidationError as error:
                    return Response(error.message_dict, status=status.HTTP_400_BAD_REQUEST)
                scenario.status = SimulationScenario.Status.APPROVED
                scenario.reviewed_by = request.user
                scenario.reviewed_at = now
                scenario.review_notes = review_notes
            elif transition == "return_to_draft":
                if not is_admin:
                    return self._forbidden_reviewer()
                if scenario.status not in {
                    SimulationScenario.Status.REVIEW,
                    SimulationScenario.Status.APPROVED,
                }:
                    return self._conflict("Only a reviewed scenario can return to draft.")
                if not review_notes:
                    return Response(
                        {"detail": "Review notes are required when returning a scenario."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                scenario.status = SimulationScenario.Status.DRAFT
                scenario.reviewed_by = request.user
                scenario.reviewed_at = now
                scenario.review_notes = review_notes
                scenario.submitted_at = None
            elif transition == "retire":
                if not is_admin:
                    return self._forbidden_reviewer()
                if scenario.status != SimulationScenario.Status.PUBLISHED:
                    return self._conflict("Only a published scenario can be retired.")
                scenario.status = SimulationScenario.Status.RETIRED
            scenario.save()
            record_audit_event(
                event_type=f"content.scenario_{transition}",
                actor=request.user,
                school=school,
                target=scenario,
                payload={
                    "fromStatus": previous_status,
                    "toStatus": scenario.status,
                    "version": scenario.version,
                },
            )
        return Response(ScenarioAuthoringSerializer(scenario).data)

    @action(detail=True, methods=["post"], url_path="clone-draft")
    def clone_draft(self, request, pk=None):
        source = self.get_object()
        next_version = (
            SimulationScenario.objects.filter(lesson=source.lesson).aggregate(
                latest=Max("version")
            )["latest"]
            or 0
        ) + 1
        clone = SimulationScenario.objects.create(
            lesson=source.lesson,
            version=next_version,
            title=f"{source.title} v{next_version}",
            definition=source.definition,
            grading_policy=source.grading_policy,
            asset_package=source.asset_package,
            status=SimulationScenario.Status.DRAFT,
            authored_by=request.user,
        )
        record_audit_event(
            event_type="content.scenario_cloned",
            actor=request.user,
            school=source.lesson.course.school,
            target=clone,
            payload={"sourceScenarioId": source.pk, "version": next_version},
        )
        return Response(ScenarioAuthoringSerializer(clone).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _conflict(detail):
        return Response({"detail": detail}, status=status.HTTP_409_CONFLICT)

    @staticmethod
    def _forbidden_reviewer():
        return Response(
            {"detail": "A school administrator must review this transition."},
            status=status.HTTP_403_FORBIDDEN,
        )


class AssetPackageAuthoringViewSet(viewsets.ModelViewSet):
    queryset = AssetPackage.objects.none()
    serializer_class = AssetPackageAuthoringSerializer
    permission_classes = [IsContentAuthorOrSchoolAdmin]
    ordering = ["course__title", "code", "-version"]

    def get_queryset(self):
        return (
            AssetPackage.objects.filter(
                course__school_id__in=_content_school_ids(self.request.user)
            )
            .select_related("course", "course__school")
            .prefetch_related("files")
        )

    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        if course.school_id not in _content_school_ids(self.request.user):
            raise PermissionDenied("The course must belong to your active school.")
        package = serializer.save(status=AssetPackage.Status.DRAFT)
        record_audit_event(
            event_type="content.asset_package_created",
            actor=self.request.user,
            school=course.school,
            target=package,
            payload={"version": package.version},
        )

    def update(self, request, *args, **kwargs):
        if self.get_object().status != AssetPackage.Status.DRAFT:
            return self._conflict("Published asset packages are immutable.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        package = self.get_object()
        if package.status != AssetPackage.Status.DRAFT:
            return self._conflict("Published asset packages cannot be deleted.")
        for asset in package.files.all():
            if not asset.path.startswith(("/", "http://", "https://")):
                default_storage.delete(asset.path)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="files")
    @extend_schema(
        request=AssetUploadSerializer,
        responses={status.HTTP_201_CREATED: AssetPackageAuthoringSerializer},
    )
    def upload_file(self, request, pk=None):
        package = self.get_object()
        if package.status != AssetPackage.Status.DRAFT:
            return self._conflict("Upload files only to a draft asset package.")
        serializer = AssetUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]
        filename = PurePosixPath(upload.name).name
        data = upload.read()
        try:
            metadata = validate_asset_bytes(filename, upload.content_type, data)
        except DjangoValidationError as error:
            return Response({"file": error.messages}, status=status.HTTP_400_BAD_REQUEST)
        metadata.update(
            {
                "altText": serializer.validated_data.get("altText", "").strip(),
                "transcript": serializer.validated_data.get("transcript", "").strip(),
            }
        )
        digest = hashlib.sha256(data).hexdigest()
        path = (
            f"immersive-assets/{package.course.school.code}/{package.code}/"
            f"v{package.version}/{digest[:12]}-{filename}"
        )
        if package.files.filter(path=path).exists():
            return Response(
                {"detail": "This exact asset is already in the package."},
                status=status.HTTP_409_CONFLICT,
            )
        saved_path = default_storage.save(path, ContentFile(data))
        try:
            asset = AssetFile.objects.create(
                package=package,
                path=saved_path,
                mime_type=upload.content_type,
                byte_size=len(data),
                sha256=digest,
                role=serializer.validated_data["role"],
                license_spdx=serializer.validated_data["licenseSpdx"],
                source_attribution=serializer.validated_data["sourceAttribution"],
                metadata=metadata,
            )
            self._refresh_digest(package)
        except Exception:
            default_storage.delete(saved_path)
            raise
        record_audit_event(
            event_type="content.asset_uploaded",
            actor=request.user,
            school=package.course.school,
            target=package,
            payload={"path": saved_path, "sha256": digest, "role": asset.role},
        )
        return Response(
            AssetPackageAuthoringSerializer(package).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        parameters=[OpenApiParameter("file_id", int, OpenApiParameter.PATH)],
        responses={status.HTTP_204_NO_CONTENT: None},
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"files/(?P<file_id>[^/.]+)",
    )
    def remove_file(self, request, pk=None, file_id: int | None = None):
        package = self.get_object()
        if package.status != AssetPackage.Status.DRAFT:
            return self._conflict("Remove files only from a draft asset package.")
        asset = package.files.filter(pk=file_id).first()
        if asset is None:
            return Response({"detail": "Asset file not found."}, status=status.HTTP_404_NOT_FOUND)
        path = asset.path
        asset.delete()
        if not path.startswith(("/", "http://", "https://")):
            default_storage.delete(path)
        self._refresh_digest(package)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        package = self.get_object()
        if not self._is_admin(request, package):
            return self._forbidden_reviewer()
        if package.status != AssetPackage.Status.DRAFT:
            return self._conflict("Only a draft asset package can be published.")
        errors = package_publication_errors(package)
        if errors:
            return Response({"publication": errors}, status=status.HTTP_400_BAD_REQUEST)
        package.status = AssetPackage.Status.PUBLISHED
        package.save()
        record_audit_event(
            event_type="content.asset_package_published",
            actor=request.user,
            school=package.course.school,
            target=package,
            payload={"version": package.version, "sha256": package.sha256},
        )
        return Response(AssetPackageAuthoringSerializer(package).data)

    @action(detail=True, methods=["post"])
    def retire(self, request, pk=None):
        package = self.get_object()
        if not self._is_admin(request, package):
            return self._forbidden_reviewer()
        if package.status != AssetPackage.Status.PUBLISHED:
            return self._conflict("Only a published asset package can be retired.")
        package.status = AssetPackage.Status.RETIRED
        package.save()
        return Response(AssetPackageAuthoringSerializer(package).data)

    @staticmethod
    def _refresh_digest(package):
        package._prefetched_objects_cache.pop("files", None)
        files = list(package.files.order_by("path"))
        package.total_byte_size = sum(item.byte_size for item in files)
        package.sha256 = hashlib.sha256(
            "".join(item.sha256 for item in files).encode("ascii")
        ).hexdigest()
        package.save(update_fields=["total_byte_size", "sha256", "updated_at"])
        package._prefetched_objects_cache.pop("files", None)

    @staticmethod
    def _is_admin(request, package):
        return request.user.is_superuser or has_active_school_role(
            request.user,
            [SchoolMembership.Role.ADMIN],
            school=package.course.school,
        )

    @staticmethod
    def _conflict(detail):
        return Response({"detail": detail}, status=status.HTTP_409_CONFLICT)

    @staticmethod
    def _forbidden_reviewer():
        return Response(
            {"detail": "A school administrator must approve this asset transition."},
            status=status.HTTP_403_FORBIDDEN,
        )
