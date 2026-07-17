from django.contrib import admin

from .models import (
    Assignment,
    Attempt,
    AttemptEvent,
    AuditEvent,
    Cohort,
    Competency,
    Course,
    Enrollment,
    InstructorProfile,
    LearnerProfile,
    Lesson,
    MechanicalObject,
    Module,
    ProcedureStep,
    Program,
    School,
    SchoolInvitation,
    SchoolMembership,
    ThreeDModel,
    UserProgress,
)


class ProcedureStepInline(admin.TabularInline):
    model = ProcedureStep
    extra = 0
    ordering = ("order",)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    search_fields = ("name", "code")


@admin.register(SchoolMembership)
class SchoolMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "school", "role", "is_active")
    list_filter = ("role", "is_active", "school")
    search_fields = ("user__username", "user__email", "school__name")


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "school", "is_active")
    list_filter = ("is_active", "school")
    search_fields = ("code", "name", "school__name")


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "program", "school", "academic_year", "is_active")
    list_filter = ("is_active", "school", "program")
    search_fields = ("code", "name", "program__name")


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("learner", "cohort", "status", "enrolled_at", "completed_at")
    list_filter = ("status", "cohort__school", "cohort")
    search_fields = ("learner__username", "learner__email", "cohort__name")


@admin.register(LearnerProfile)
class LearnerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "student_id", "preferred_language", "updated_at")
    list_filter = ("preferred_language",)
    search_fields = ("user__username", "user__email", "student_id")


@admin.register(InstructorProfile)
class InstructorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "employee_id", "updated_at")
    search_fields = ("user__username", "user__email", "employee_id")


@admin.register(SchoolInvitation)
class SchoolInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "school", "role", "is_active", "expires_at", "accepted_at")
    list_filter = ("role", "is_active", "school")
    search_fields = ("email", "school__name")
    readonly_fields = ("token_hash", "created_by", "created_at", "accepted_at")


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("title", "program", "trade", "school", "is_published")
    list_filter = ("program", "trade", "is_published", "school")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "course", "order", "is_published")
    list_filter = ("is_published", "course")
    search_fields = ("code", "title", "course__title")


@admin.register(Competency)
class CompetencyAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "course", "mastery_threshold")
    list_filter = ("course",)
    search_fields = ("code", "title")


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "status", "estimated_minutes", "updated_at")
    list_filter = ("status", "course")
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ("competencies",)
    inlines = (ProcedureStepInline,)


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("lesson", "learner", "assigned_by", "due_at", "created_at")
    list_filter = ("lesson__course",)
    search_fields = ("learner__username", "learner__email", "lesson__title")


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "learner", "assignment", "status", "score", "started_at")
    list_filter = ("status", "assignment__lesson__course")
    readonly_fields = ("started_at", "updated_at")


@admin.register(AttemptEvent)
class AttemptEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "sequence", "event_type", "occurred_at")
    list_filter = ("event_type",)
    readonly_fields = ("received_at",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "actor", "school", "target_type", "target_id", "occurred_at")
    list_filter = ("event_type", "school")
    search_fields = ("event_type", "actor__username", "target_type", "target_id")
    readonly_fields = (
        "event_type",
        "actor",
        "school",
        "target_type",
        "target_id",
        "payload",
        "occurred_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(MechanicalObject)
admin.site.register(UserProgress)
admin.site.register(ThreeDModel)
