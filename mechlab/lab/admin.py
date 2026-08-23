from django.contrib import admin

from .models import (
    AcceptableAction,
    AdaptiveRecommendation,
    AssetFile,
    AssetPackage,
    Assignment,
    Attempt,
    AttemptEvent,
    AttemptSyncAudit,
    AuditEvent,
    Cohort,
    Competency,
    CompetencyResult,
    Course,
    Enrollment,
    GradingPolicy,
    Hazard,
    InstructorFeedback,
    InstructorProfile,
    KnowledgeCheckSubmission,
    LearnerProfile,
    Lesson,
    MechanicalObject,
    Module,
    PilotApproval,
    PilotIncident,
    PilotObservation,
    PilotRehearsal,
    PilotReview,
    PilotStudy,
    ProcedureStep,
    Program,
    ResearchConsentReceipt,
    ResearchSurveyResponse,
    School,
    SchoolInvitation,
    SchoolMembership,
    SimulationScenario,
    StepFeedback,
    StepHint,
    StepResult,
    StepTolerance,
    ThreeDModel,
    Tool,
    UserProgress,
    XApiDelivery,
)


class ProcedureStepInline(admin.TabularInline):
    model = ProcedureStep
    extra = 0
    ordering = ("order",)


class AssetFileInline(admin.TabularInline):
    model = AssetFile
    extra = 0

    def has_add_permission(self, request, obj=None):
        return obj is None or obj.status == AssetPackage.Status.DRAFT

    def has_change_permission(self, request, obj=None):
        return obj is None or obj.status == AssetPackage.Status.DRAFT

    def has_delete_permission(self, request, obj=None):
        return obj is None or obj.status == AssetPackage.Status.DRAFT


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
    list_display = (
        "code",
        "title",
        "course",
        "curriculum_reference",
        "level",
        "mastery_threshold",
    )
    list_filter = ("level", "course")
    search_fields = ("code", "title", "curriculum_reference")


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "course",
        "language",
        "content_version",
        "status",
        "authored_by",
        "reviewed_by",
        "updated_at",
    )
    list_filter = ("status", "language", "course")
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ("competencies", "prerequisites")
    readonly_fields = ("submitted_at", "reviewed_at", "published_at")
    inlines = (ProcedureStepInline,)


@admin.register(GradingPolicy)
class GradingPolicyAdmin(admin.ModelAdmin):
    list_display = ("code", "version", "name", "algorithm", "status", "published_at")
    list_filter = ("status", "code")
    search_fields = ("code", "name")
    readonly_fields = ("published_at", "created_at", "updated_at")


@admin.register(AssetPackage)
class AssetPackageAdmin(admin.ModelAdmin):
    list_display = ("code", "version", "course", "status", "total_byte_size")
    list_filter = ("status", "course")
    search_fields = ("code", "name", "course__title")
    readonly_fields = ("published_at", "created_at", "updated_at")
    inlines = (AssetFileInline,)


@admin.register(SimulationScenario)
class SimulationScenarioAdmin(admin.ModelAdmin):
    list_display = ("title", "version", "lesson", "grading_policy", "status")
    list_filter = ("status", "lesson__course")
    search_fields = ("title", "lesson__title")
    readonly_fields = ("published_at", "created_at", "updated_at")


@admin.register(Tool)
class ToolAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "course")
    list_filter = ("course",)
    search_fields = ("code", "name")


@admin.register(Hazard)
class HazardAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "course", "severity")
    list_filter = ("severity", "course")
    search_fields = ("code", "title")


@admin.register(ProcedureStep)
class ProcedureStepAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "lesson", "order", "safety_critical")
    list_filter = ("safety_critical", "lesson__course")
    search_fields = ("code", "title", "lesson__title")
    filter_horizontal = ("competencies", "required_tools", "hazards")


@admin.register(StepHint)
class StepHintAdmin(admin.ModelAdmin):
    list_display = ("code", "step", "order", "points_penalty")
    list_filter = ("step__lesson__course",)


@admin.register(StepTolerance)
class StepToleranceAdmin(admin.ModelAdmin):
    list_display = ("code", "step", "measurement", "minimum_value", "maximum_value", "unit")
    list_filter = ("step__lesson__course",)


@admin.register(AcceptableAction)
class AcceptableActionAdmin(admin.ModelAdmin):
    list_display = ("action_code", "step", "is_primary", "tolerance")
    list_filter = ("is_primary", "step__lesson__course")


@admin.register(StepFeedback)
class StepFeedbackAdmin(admin.ModelAdmin):
    list_display = ("step", "outcome")
    list_filter = ("outcome", "step__lesson__course")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("lesson", "scenario", "learner", "assigned_by", "due_at", "created_at")
    list_filter = ("lesson__course",)
    search_fields = ("learner__username", "learner__email", "lesson__title")


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "learner",
        "assignment",
        "scenario",
        "grading_policy",
        "status",
        "score",
        "started_at",
    )
    list_filter = ("status", "assignment__lesson__course")
    readonly_fields = (
        "assignment",
        "scenario",
        "grading_policy",
        "learner",
        "status",
        "outcome",
        "score",
        "resume_state",
        "started_at",
        "completed_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AttemptEvent)
class AttemptEventAdmin(admin.ModelAdmin):
    list_display = ("attempt", "sequence", "event_type", "renderer_mode", "occurred_at")
    list_filter = ("event_type", "renderer_mode")
    readonly_fields = (
        "attempt",
        "event_id",
        "sequence",
        "event_type",
        "schema_version",
        "activity_id",
        "renderer_mode",
        "payload",
        "occurred_at",
        "client_occurred_at",
        "received_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class ImmutableResultAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AttemptSyncAudit)
class AttemptSyncAuditAdmin(ImmutableResultAdmin):
    list_display = ("attempt", "audit_id", "passed", "pending_count", "audited_at")
    list_filter = ("passed", "audited_at")


@admin.register(StepResult)
class StepResultAdmin(ImmutableResultAdmin):
    list_display = ("attempt", "step_code", "outcome", "achieved_points", "available_points")
    list_filter = ("outcome", "attempt__assignment__lesson__course")


@admin.register(CompetencyResult)
class CompetencyResultAdmin(ImmutableResultAdmin):
    list_display = (
        "attempt",
        "competency_code",
        "mastery_state",
        "mastery_percentage",
    )
    list_filter = ("mastery_state", "attempt__assignment__lesson__course")


@admin.register(KnowledgeCheckSubmission)
class KnowledgeCheckSubmissionAdmin(admin.ModelAdmin):
    list_display = ("assignment", "learner", "score", "submitted_at")
    list_filter = ("assignment__lesson__course",)
    readonly_fields = ("submitted_at",)


@admin.register(InstructorFeedback)
class InstructorFeedbackAdmin(admin.ModelAdmin):
    list_display = ("attempt", "author", "is_published", "published_at", "updated_at")
    list_filter = ("is_published", "attempt__assignment__lesson__course")
    readonly_fields = ("created_at", "updated_at", "published_at")


@admin.register(AdaptiveRecommendation)
class AdaptiveRecommendationAdmin(admin.ModelAdmin):
    list_display = ("attempt", "rule_version", "kind", "confidence", "created_at")
    list_filter = ("kind", "rule_version")
    readonly_fields = (
        "attempt",
        "rule_version",
        "kind",
        "input_snapshot",
        "rationale",
        "confidence",
        "created_at",
    )


@admin.register(ResearchSurveyResponse)
class ResearchSurveyResponseAdmin(admin.ModelAdmin):
    list_display = ("participant_code", "school", "instrument", "scenario_version", "submitted_at")
    list_filter = ("instrument", "school")
    search_fields = ("participant_code", "scenario_version")
    readonly_fields = ("submitted_at",)


@admin.register(ResearchConsentReceipt)
class ResearchConsentReceiptAdmin(admin.ModelAdmin):
    list_display = (
        "participant_code",
        "school",
        "consent_version",
        "scenario_version",
        "status",
        "consented_at",
        "expires_at",
    )
    list_filter = ("status", "consent_version", "school")
    search_fields = ("participant_code", "scenario_version")
    readonly_fields = (
        "school",
        "participant_code",
        "consent_version",
        "scenario_version",
        "status",
        "consented_at",
        "withdrawn_at",
        "expires_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PilotStudy)
class PilotStudyAdmin(admin.ModelAdmin):
    list_display = ("code", "school", "protocol_version", "scenario", "cohort", "status")
    list_filter = ("status", "school")
    search_fields = ("code", "title", "protocol_version")
    readonly_fields = (
        "protocol_snapshot",
        "status",
        "created_by",
        "frozen_by",
        "frozen_at",
        "collection_started_at",
        "collection_closed_at",
        "created_at",
        "updated_at",
    )

    def has_delete_permission(self, request, obj=None):
        return obj is None or obj.status == PilotStudy.Status.DRAFT


for pilot_model in [
    PilotApproval,
    PilotObservation,
    PilotIncident,
    PilotRehearsal,
    PilotReview,
]:
    admin.site.register(pilot_model, ImmutableResultAdmin)


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


@admin.register(XApiDelivery)
class XApiDeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "statement_id",
        "attempt",
        "status",
        "delivery_attempts",
        "next_attempt_at",
        "delivered_at",
    )
    list_filter = ("status",)
    search_fields = ("statement_id", "attempt__learner__email")
    readonly_fields = (
        "attempt",
        "statement_id",
        "statement",
        "delivery_attempts",
        "next_attempt_at",
        "last_error",
        "delivered_at",
        "created_at",
        "updated_at",
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
