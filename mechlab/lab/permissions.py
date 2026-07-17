from rest_framework.permissions import BasePermission

from .models import SchoolMembership


def has_active_school_role(user, roles, *, school=None) -> bool:
    """Return whether a user has one of the supplied roles in an active school."""

    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    memberships = SchoolMembership.objects.filter(
        user=user,
        is_active=True,
        school__is_active=True,
        role__in=roles,
    )
    if school is not None:
        memberships = memberships.filter(school=school)
    return memberships.exists()


class IsPlatformAdministrator(BasePermission):
    message = "A platform administrator account is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.is_superuser
        )


class HasActiveSchoolRole(BasePermission):
    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        return has_active_school_role(request.user, self.allowed_roles)


class IsInstructorOrSchoolAdmin(HasActiveSchoolRole):
    message = "An active instructor or school administrator role is required."
    allowed_roles = (SchoolMembership.Role.ADMIN, SchoolMembership.Role.INSTRUCTOR)


class IsSchoolAdmin(HasActiveSchoolRole):
    message = "An active school administrator role is required."
    allowed_roles = (SchoolMembership.Role.ADMIN,)


class IsContentAuthorOrSchoolAdmin(HasActiveSchoolRole):
    message = "An active content author or school administrator role is required."
    allowed_roles = (SchoolMembership.Role.ADMIN, SchoolMembership.Role.CONTENT_AUTHOR)


class IsLearner(HasActiveSchoolRole):
    message = "An active learner role is required."
    allowed_roles = (SchoolMembership.Role.LEARNER,)
