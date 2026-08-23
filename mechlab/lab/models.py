import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone


class MechanicalObject(models.Model):
    name = models.CharField(max_length=100)
    position_x = models.FloatField()
    position_y = models.FloatField()
    position_z = models.FloatField()
    rotation = models.FloatField(default=0.0)

    def __str__(self):
        return self.name


class UserProgress(models.Model):
    """Legacy aggregate progress record; new learning uses Attempt and AttemptEvent."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    score = models.IntegerField(default=0)
    last_modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.get_username()


class ThreeDModel(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    thumbnail = models.ImageField(upload_to="model_thumbnails/", null=True, blank=True)
    model_file = models.FileField(upload_to="3d_models/")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "3d_models"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class School(models.Model):
    name = models.CharField(max_length=180)
    code = models.SlugField(max_length=60, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Program(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="programs")
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="unique_school_program_code")
        ]
        ordering = ["school__name", "name"]

    def __str__(self):
        return f"{self.code} · {self.name}"


class SchoolMembership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "School administrator"
        INSTRUCTOR = "instructor", "Instructor"
        LEARNER = "learner", "Learner"
        CONTENT_AUTHOR = "content_author", "Content author"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="school_memberships",
    )
    role = models.CharField(max_length=24, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "user"], name="unique_school_membership")
        ]
        ordering = ["school__name", "user__username"]

    def __str__(self):
        return f"{self.user.get_username()} · {self.school.code} · {self.role}"


class LearnerProfile(models.Model):
    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        KINYARWANDA = "rw", "Kinyarwanda"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learner_profile",
    )
    student_id = models.CharField(max_length=60, blank=True)
    preferred_language = models.CharField(
        max_length=8,
        choices=Language.choices,
        default=Language.ENGLISH,
    )
    accessibility_notes = models.TextField(
        blank=True,
        help_text="Learning accommodations only; do not store diagnoses or unrelated medical data.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.user.get_username()


class InstructorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="instructor_profile",
    )
    employee_id = models.CharField(max_length=60, blank=True)
    qualifications = models.JSONField(default=list, blank=True)
    biography = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if not isinstance(self.qualifications, list) or any(
            not isinstance(item, str) or not item.strip() for item in self.qualifications
        ):
            raise ValidationError(
                {"qualifications": "Qualifications must be a list of non-empty text values."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.user.get_username()


class Cohort(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="cohorts")
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="cohorts")
    code = models.SlugField(max_length=60)
    name = models.CharField(max_length=180)
    academic_year = models.CharField(max_length=20, blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="unique_school_cohort_code"),
            models.CheckConstraint(
                condition=(
                    models.Q(starts_on__isnull=True)
                    | models.Q(ends_on__isnull=True)
                    | models.Q(ends_on__gte=models.F("starts_on"))
                ),
                name="cohort_end_not_before_start",
            ),
        ]
        ordering = ["-academic_year", "name"]

    def clean(self):
        if self.program_id and self.school_id and self.program.school_id != self.school_id:
            raise ValidationError({"program": "The program must belong to the cohort's school."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} · {self.name}"


class Enrollment(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        WITHDRAWN = "withdrawn", "Withdrawn"

    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="enrollments")
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cohort_enrollments",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["cohort", "learner"], name="unique_cohort_learner_enrollment"
            )
        ]
        ordering = ["cohort__name", "learner__username"]

    def clean(self):
        if self.cohort_id and self.learner_id:
            is_learner = SchoolMembership.objects.filter(
                school_id=self.cohort.school_id,
                user_id=self.learner_id,
                role=SchoolMembership.Role.LEARNER,
                is_active=True,
                school__is_active=True,
            ).exists()
            if not is_learner:
                raise ValidationError(
                    {"learner": "An active learner membership in the cohort's school is required."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.learner.get_username()} · {self.cohort.code}"


class SchoolInvitation(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(max_length=24, choices=SchoolMembership.Role.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="school_invitations_created",
    )
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["school", "email", "is_active"])]

    def __str__(self):
        return f"{self.email} · {self.school.code} · {self.role}"


class Course(models.Model):
    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name="courses",
        null=True,
        blank=True,
        help_text="Leave empty for platform-wide content.",
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.PROTECT,
        related_name="courses",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=180)
    slug = models.SlugField(max_length=180, unique=True)
    trade = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def clean(self):
        if self.program_id and self.school_id != self.program.school_id:
            raise ValidationError({"program": "The program must belong to the course's school."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Module(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    code = models.SlugField(max_length=60)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=1)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "code"], name="unique_course_module_code"),
            models.UniqueConstraint(fields=["course", "order"], name="unique_course_module_order"),
        ]
        ordering = ["course__title", "order"]

    def __str__(self):
        return f"{self.course.title} · {self.title}"


class Competency(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="competencies")
    code = models.CharField(max_length=60)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    curriculum_reference = models.CharField(max_length=120, blank=True)
    level = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(8)],
    )
    evidence_rules = models.JSONField(default=list, blank=True)
    mastery_criteria = models.JSONField(default=list, blank=True)
    mastery_threshold = models.PositiveSmallIntegerField(default=80)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course", "code"], name="unique_course_competency_code"
            ),
            models.CheckConstraint(
                condition=models.Q(mastery_threshold__lte=100),
                name="competency_threshold_lte_100",
            ),
        ]
        ordering = ["code"]
        verbose_name_plural = "competencies"

    def clean(self):
        if not isinstance(self.evidence_rules, list):
            raise ValidationError({"evidence_rules": "Evidence rules must be a list."})
        if not isinstance(self.mastery_criteria, list) or any(
            not isinstance(item, str) or not item.strip() for item in self.mastery_criteria
        ):
            raise ValidationError(
                {"mastery_criteria": "Mastery criteria must be a list of non-empty text values."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} · {self.title}"


class Lesson(models.Model):
    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        KINYARWANDA = "rw", "Kinyarwanda"
        BILINGUAL = "en-rw", "English and Kinyarwanda"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEW = "review", "In review"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        RETIRED = "retired", "Retired"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="lessons")
    module = models.ForeignKey(
        Module,
        on_delete=models.PROTECT,
        related_name="lessons",
        null=True,
        blank=True,
    )
    competencies = models.ManyToManyField(Competency, related_name="lessons", blank=True)
    prerequisites = models.ManyToManyField(
        "self",
        symmetrical=False,
        related_name="unlocks_lessons",
        blank=True,
    )
    title = models.CharField(max_length=180)
    slug = models.SlugField(max_length=180)
    summary = models.TextField()
    objectives = models.JSONField(default=list, blank=True)
    safety_notes = models.JSONField(default=list, blank=True)
    estimated_minutes = models.PositiveSmallIntegerField(default=30)
    language = models.CharField(
        max_length=8,
        choices=Language.choices,
        default=Language.ENGLISH,
    )
    content_version = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    authored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="lessons_authored",
        null=True,
        blank=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="lessons_reviewed",
        null=True,
        blank=True,
    )
    review_notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "slug"], name="unique_course_lesson_slug")
        ]
        ordering = ["course__title", "title"]

    def clean(self):
        if self.module_id and self.course_id != self.module.course_id:
            raise ValidationError({"module": "The module must belong to the lesson's course."})
        for field_name in ["objectives", "safety_notes"]:
            value = getattr(self, field_name)
            if not isinstance(value, list) or any(
                not isinstance(item, str) or not item.strip() for item in value
            ):
                raise ValidationError(
                    {field_name: f"{field_name.replace('_', ' ').title()} must be a list of text."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class GradingPolicy(models.Model):
    BASE_MINUS_EVENT_PENALTIES_V1 = "base-minus-event-penalties-v1"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        RETIRED = "retired", "Retired"

    code = models.SlugField(max_length=80)
    version = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    name = models.CharField(max_length=180)
    algorithm = models.CharField(max_length=60, default=BASE_MINUS_EVENT_PENALTIES_V1)
    base_score = models.PositiveSmallIntegerField(
        default=100,
        validators=[MaxValueValidator(100)],
    )
    pass_threshold = models.PositiveSmallIntegerField(
        default=80,
        validators=[MaxValueValidator(100)],
    )
    incorrect_action_penalty = models.PositiveSmallIntegerField(
        default=5,
        validators=[MaxValueValidator(100)],
    )
    safety_critical_penalty = models.PositiveSmallIntegerField(
        default=15,
        validators=[MaxValueValidator(100)],
    )
    requires_review_on_safety_error = models.BooleanField(default=False)
    rules = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["code", "version"],
                name="unique_grading_policy_version",
            )
        ]
        ordering = ["code", "-version"]

    def clean(self):
        if not isinstance(self.rules, dict):
            raise ValidationError({"rules": "Grading policy rules must be an object."})

    def save(self, *args, **kwargs):
        self.full_clean()
        self._prevent_published_changes()
        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status in {self.Status.PUBLISHED, self.Status.RETIRED}:
            raise ValidationError("Published grading-policy versions cannot be deleted.")
        return super().delete(*args, **kwargs)

    def score_events(self, events):
        if self.algorithm != self.BASE_MINUS_EVENT_PENALTIES_V1:
            raise ValidationError(f"Unsupported grading algorithm: {self.algorithm}")
        penalty = 0
        for event in events:
            if event.event_type == "hint_used":
                penalty += int(event.payload.get("pointsPenalty", 0))
            elif event.event_type in {"incorrect_action", "tolerance_failed"}:
                penalty += (
                    self.safety_critical_penalty
                    if event.payload.get("safetyCritical") is True
                    else self.incorrect_action_penalty
                )
        return max(0, self.base_score - penalty)

    def _prevent_published_changes(self):
        if not self.pk:
            return
        previous = type(self).objects.filter(pk=self.pk).first()
        if previous is None or previous.status not in {self.Status.PUBLISHED, self.Status.RETIRED}:
            return
        immutable_fields = (
            "code",
            "version",
            "name",
            "algorithm",
            "base_score",
            "pass_threshold",
            "incorrect_action_penalty",
            "safety_critical_penalty",
            "requires_review_on_safety_error",
            "rules",
        )
        if any(getattr(previous, field) != getattr(self, field) for field in immutable_fields):
            raise ValidationError("Published grading-policy versions cannot be edited in place.")
        if previous.status == self.Status.RETIRED and self.status != self.Status.RETIRED:
            raise ValidationError("A retired grading-policy version cannot be reactivated.")
        if previous.status == self.Status.PUBLISHED and self.status not in {
            self.Status.PUBLISHED,
            self.Status.RETIRED,
        }:
            raise ValidationError("A published grading policy can only be retired.")

    def __str__(self):
        return f"{self.code} v{self.version}"


class AssetPackage(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        RETIRED = "retired", "Retired"

    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="asset_packages")
    code = models.SlugField(max_length=80)
    version = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    name = models.CharField(max_length=180)
    manifest = models.JSONField(default=dict, blank=True)
    sha256 = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"^[0-9a-f]{64}$", "Enter a lowercase SHA-256 digest.")],
    )
    total_byte_size = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course", "code", "version"],
                name="unique_course_asset_package_version",
            )
        ]
        ordering = ["course__title", "code", "-version"]

    def clean(self):
        if not isinstance(self.manifest, dict):
            raise ValidationError({"manifest": "The asset manifest must be an object."})

    def save(self, *args, **kwargs):
        self.full_clean()
        self._prevent_published_changes()
        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status in {self.Status.PUBLISHED, self.Status.RETIRED}:
            raise ValidationError("Published asset-package versions cannot be deleted.")
        return super().delete(*args, **kwargs)

    def _prevent_published_changes(self):
        if not self.pk:
            return
        previous = type(self).objects.filter(pk=self.pk).first()
        if previous is None or previous.status not in {self.Status.PUBLISHED, self.Status.RETIRED}:
            return
        immutable_fields = (
            "course_id",
            "code",
            "version",
            "name",
            "manifest",
            "sha256",
            "total_byte_size",
        )
        if any(getattr(previous, field) != getattr(self, field) for field in immutable_fields):
            raise ValidationError("Published asset-package versions cannot be edited in place.")
        if previous.status == self.Status.RETIRED and self.status != self.Status.RETIRED:
            raise ValidationError("A retired asset-package version cannot be reactivated.")
        if previous.status == self.Status.PUBLISHED and self.status not in {
            self.Status.PUBLISHED,
            self.Status.RETIRED,
        }:
            raise ValidationError("A published asset package can only be retired.")

    def __str__(self):
        return f"{self.name} v{self.version}"


class AssetFile(models.Model):
    package = models.ForeignKey(AssetPackage, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=500)
    mime_type = models.CharField(max_length=120)
    byte_size = models.PositiveBigIntegerField()
    sha256 = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"^[0-9a-f]{64}$", "Enter a lowercase SHA-256 digest.")],
    )
    role = models.CharField(max_length=60, blank=True)
    license_spdx = models.CharField(max_length=64, blank=True)
    source_attribution = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["package", "path"],
                name="unique_asset_file_path",
            )
        ]
        ordering = ["path"]

    def save(self, *args, **kwargs):
        if self.package.status != AssetPackage.Status.DRAFT:
            raise ValidationError("Files in a published asset package cannot be changed.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.package.status != AssetPackage.Status.DRAFT:
            raise ValidationError("Files in a published asset package cannot be deleted.")
        return super().delete(*args, **kwargs)

    def __str__(self):
        return self.path


class SimulationScenario(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEW = "review", "In review"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        RETIRED = "retired", "Retired"

    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name="scenarios")
    version = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    title = models.CharField(max_length=180)
    definition = models.JSONField(default=dict)
    grading_policy = models.ForeignKey(
        GradingPolicy,
        on_delete=models.PROTECT,
        related_name="scenarios",
    )
    asset_package = models.ForeignKey(
        AssetPackage,
        on_delete=models.PROTECT,
        related_name="scenarios",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    authored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="scenarios_authored",
        null=True,
        blank=True,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="scenarios_reviewed",
        null=True,
        blank=True,
    )
    review_notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["lesson", "version"],
                name="unique_lesson_scenario_version",
            )
        ]
        ordering = ["lesson__title", "-version"]

    def clean(self):
        if not isinstance(self.definition, dict):
            raise ValidationError({"definition": "The scenario definition must be an object."})
        steps = self.definition.get("steps", [])
        if not isinstance(steps, list):
            raise ValidationError({"definition": "Scenario steps must be a list."})
        required_step_fields = {"order", "code", "title", "instruction", "action_code"}
        if any(
            not isinstance(step, dict) or not required_step_fields.issubset(step) for step in steps
        ):
            raise ValidationError(
                {"definition": "Each scenario step must contain its ordered action definition."}
            )
        if self.asset_package_id and self.asset_package.course_id != self.lesson.course_id:
            raise ValidationError(
                {"asset_package": "The asset package must belong to the lesson's course."}
            )
        if self.status == self.Status.PUBLISHED:
            if not steps:
                raise ValidationError({"definition": "A published scenario requires steps."})
            if self.grading_policy.status != GradingPolicy.Status.PUBLISHED:
                raise ValidationError(
                    {"grading_policy": "Publish the grading policy before the scenario."}
                )
            if self.asset_package_id and self.asset_package.status != AssetPackage.Status.PUBLISHED:
                raise ValidationError(
                    {"asset_package": "Publish the asset package before the scenario."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        self._prevent_published_changes()
        if self.status == self.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status in {self.Status.PUBLISHED, self.Status.RETIRED}:
            raise ValidationError("Published scenario versions cannot be deleted.")
        return super().delete(*args, **kwargs)

    def _prevent_published_changes(self):
        if not self.pk:
            return
        previous = type(self).objects.filter(pk=self.pk).first()
        if previous is None or previous.status not in {self.Status.PUBLISHED, self.Status.RETIRED}:
            return
        immutable_fields = (
            "lesson_id",
            "version",
            "title",
            "definition",
            "grading_policy_id",
            "asset_package_id",
        )
        if any(getattr(previous, field) != getattr(self, field) for field in immutable_fields):
            raise ValidationError("Published scenario versions cannot be edited in place.")
        if previous.status == self.Status.RETIRED and self.status != self.Status.RETIRED:
            raise ValidationError("A retired scenario version cannot be reactivated.")
        if previous.status == self.Status.PUBLISHED and self.status not in {
            self.Status.PUBLISHED,
            self.Status.RETIRED,
        }:
            raise ValidationError("A published scenario can only be retired.")

    def __str__(self):
        return f"{self.lesson.title} v{self.version}"


class Tool(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="tools")
    code = models.SlugField(max_length=80)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "code"], name="unique_course_tool_code")
        ]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Hazard(models.Model):
    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="hazards")
    code = models.SlugField(max_length=80)
    title = models.CharField(max_length=180)
    description = models.TextField()
    mitigation = models.TextField()
    severity = models.CharField(max_length=16, choices=Severity.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["course", "code"],
                name="unique_course_hazard_code",
            )
        ]
        ordering = ["-severity", "title"]

    def __str__(self):
        return self.title


class ProcedureStep(models.Model):
    """An ordered, server-authored action in a guided practical lesson."""

    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name="procedure_steps",
    )
    order = models.PositiveSmallIntegerField()
    code = models.SlugField(max_length=80)
    title = models.CharField(max_length=180)
    instruction = models.TextField()
    action_code = models.SlugField(max_length=100)
    feedback = models.TextField()
    safety_critical = models.BooleanField(default=False)
    points = models.PositiveSmallIntegerField(default=10)
    metadata = models.JSONField(default=dict, blank=True)
    competencies = models.ManyToManyField(Competency, related_name="procedure_steps", blank=True)
    required_tools = models.ManyToManyField(Tool, related_name="procedure_steps", blank=True)
    hazards = models.ManyToManyField(Hazard, related_name="procedure_steps", blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["lesson", "order"],
                name="unique_lesson_procedure_order",
            ),
            models.UniqueConstraint(
                fields=["lesson", "code"],
                name="unique_lesson_procedure_code",
            ),
        ]
        ordering = ["order"]

    def __str__(self):
        return f"{self.lesson.title} · {self.order}. {self.title}"


class StepHint(models.Model):
    step = models.ForeignKey(ProcedureStep, on_delete=models.CASCADE, related_name="hints")
    code = models.SlugField(max_length=80)
    order = models.PositiveSmallIntegerField(default=1)
    text = models.TextField()
    points_penalty = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["step", "code"], name="unique_step_hint_code"),
            models.UniqueConstraint(fields=["step", "order"], name="unique_step_hint_order"),
        ]
        ordering = ["order"]

    def __str__(self):
        return f"{self.step.code} · {self.code}"


class StepTolerance(models.Model):
    step = models.ForeignKey(ProcedureStep, on_delete=models.CASCADE, related_name="tolerances")
    code = models.SlugField(max_length=80)
    measurement = models.CharField(max_length=120)
    minimum_value = models.DecimalField(max_digits=12, decimal_places=4)
    maximum_value = models.DecimalField(max_digits=12, decimal_places=4)
    unit = models.CharField(max_length=40)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["step", "code"],
                name="unique_step_tolerance_code",
            ),
            models.CheckConstraint(
                condition=models.Q(maximum_value__gte=models.F("minimum_value")),
                name="step_tolerance_max_gte_min",
            ),
        ]
        ordering = ["code"]

    def clean(self):
        if self.minimum_value > self.maximum_value:
            raise ValidationError(
                {"maximum_value": "Maximum tolerance must be at least the minimum."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.measurement}: {self.minimum_value}–{self.maximum_value} {self.unit}"


class AcceptableAction(models.Model):
    step = models.ForeignKey(
        ProcedureStep,
        on_delete=models.CASCADE,
        related_name="acceptable_actions",
    )
    action_code = models.SlugField(max_length=100)
    label = models.CharField(max_length=180)
    is_primary = models.BooleanField(default=False)
    tolerance = models.ForeignKey(
        StepTolerance,
        on_delete=models.PROTECT,
        related_name="acceptable_actions",
        null=True,
        blank=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["step", "action_code"],
                name="unique_step_acceptable_action",
            ),
            models.UniqueConstraint(
                fields=["step"],
                condition=models.Q(is_primary=True),
                name="unique_primary_action_per_step",
            ),
        ]
        ordering = ["-is_primary", "action_code"]

    def clean(self):
        if self.tolerance_id and self.tolerance.step_id != self.step_id:
            raise ValidationError({"tolerance": "The tolerance must belong to this step."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.label


class StepFeedback(models.Model):
    class Outcome(models.TextChoices):
        CORRECT = "correct", "Correct"
        INCORRECT = "incorrect", "Incorrect"
        SAFETY = "safety", "Safety violation"
        TOLERANCE = "tolerance", "Outside tolerance"

    step = models.ForeignKey(ProcedureStep, on_delete=models.CASCADE, related_name="feedback_rules")
    outcome = models.CharField(max_length=16, choices=Outcome.choices)
    message = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["step", "outcome"],
                name="unique_step_feedback_outcome",
            )
        ]
        ordering = ["outcome"]

    def __str__(self):
        return f"{self.step.code} · {self.outcome}"


class Assignment(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name="assignments")
    scenario = models.ForeignKey(
        SimulationScenario,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_assignments",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assignments_created",
    )
    available_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    attempt_limit = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(20)],
    )
    instructions = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["scenario", "learner"], name="unique_scenario_learner_assignment"
            )
        ]
        ordering = ["due_at", "-created_at"]

    def clean(self):
        if self.scenario_id and self.lesson_id != self.scenario.lesson_id:
            raise ValidationError(
                {"scenario": "The scenario must belong to the assignment's lesson."}
            )
        if self.scenario_id and self.scenario.status != SimulationScenario.Status.PUBLISHED:
            raise ValidationError({"scenario": "Only a published scenario can be assigned."})
        if self.available_at and self.due_at and self.due_at < self.available_at:
            raise ValidationError({"due_at": "The due date cannot be before availability."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.lesson.title} → {self.learner.get_username()}"


class Attempt(models.Model):
    class LearningMode(models.TextChoices):
        GUIDED = "guided", "Guided practice"
        INDEPENDENT = "independent", "Independent assessment"

    class RendererMode(models.TextChoices):
        ACCESSIBLE_2D = "accessible_2d", "Accessible 2D"
        DESKTOP_3D = "desktop_3d", "Desktop 3D"
        MARKER_AR = "marker_ar", "Marker AR"
        MARKERLESS_AR = "markerless_ar", "Markerless AR"

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        REQUIRES_REVIEW = "requires_review", "Requires review"
        ABANDONED = "abandoned", "Abandoned"

    class Outcome(models.TextChoices):
        PENDING = "pending", "Pending"
        PASSED = "passed", "Passed"
        FAILED = "failed", "Failed"
        REQUIRES_REVIEW = "requires_review", "Requires review"
        MASTERED = "mastered", "Mastered"

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="attempts")
    scenario = models.ForeignKey(
        SimulationScenario,
        on_delete=models.PROTECT,
        related_name="attempts",
    )
    grading_policy = models.ForeignKey(
        GradingPolicy,
        on_delete=models.PROTECT,
        related_name="attempts",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_attempts",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.IN_PROGRESS)
    outcome = models.CharField(max_length=24, choices=Outcome.choices, default=Outcome.PENDING)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    resume_state = models.JSONField(default=dict, blank=True)
    renderer_mode = models.CharField(
        max_length=24,
        choices=RendererMode.choices,
        default=RendererMode.DESKTOP_3D,
    )
    learning_mode = models.CharField(
        max_length=16,
        choices=LearningMode.choices,
        default=LearningMode.GUIDED,
    )
    capability_profile = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]

    def clean(self):
        if self.scenario_id and self.assignment_id:
            if self.scenario_id != self.assignment.scenario_id:
                raise ValidationError(
                    {"scenario": "The attempt must use the assignment's scenario version."}
                )
            if self.grading_policy_id != self.scenario.grading_policy_id:
                raise ValidationError(
                    {"grading_policy": "The attempt must use the scenario's grading policy."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Attempt {self.pk} · {self.assignment.lesson.title}"


class AttemptEvent(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="events")
    event_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    sequence = models.PositiveIntegerField()
    event_type = models.CharField(max_length=80)
    schema_version = models.PositiveSmallIntegerField(default=1)
    activity_id = models.URLField(max_length=500, blank=True)
    renderer_mode = models.CharField(
        max_length=24,
        choices=Attempt.RendererMode.choices,
        default=Attempt.RendererMode.DESKTOP_3D,
    )
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    client_occurred_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "sequence"], name="unique_attempt_event_sequence"
            )
        ]
        ordering = ["sequence"]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Attempt events are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Attempt events are immutable.")

    def __str__(self):
        return f"{self.attempt_id}:{self.sequence} · {self.event_type}"


class AttemptSyncAudit(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.PROTECT, related_name="sync_audits")
    audit_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    client_event_ids = models.JSONField(default=list, blank=True)
    server_event_ids = models.JSONField(default=list, blank=True)
    missing_event_ids = models.JSONField(default=list, blank=True)
    pending_count = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(default=False)
    client_created_at = models.DateTimeField()
    audited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-audited_at"]

    def clean(self):
        list_fields = ["client_event_ids", "server_event_ids", "missing_event_ids"]
        if any(not isinstance(getattr(self, field), list) for field in list_fields):
            raise ValidationError("Synchronization audit event identifiers must be lists.")
        if len(self.client_event_ids) != len(set(self.client_event_ids)):
            raise ValidationError("Synchronization audit client event IDs must be unique.")
        expected_passed = not self.missing_event_ids and self.pending_count == 0
        if self.passed != expected_passed:
            raise ValidationError("Synchronization audit result does not match its evidence.")

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Synchronization audits are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Synchronization audits are immutable.")


class XApiDelivery(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        DELIVERED = "delivered", "Delivered"
        FAILED = "failed", "Failed"
        DEAD_LETTER = "dead_letter", "Dead letter"

    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="xapi_deliveries")
    statement_id = models.UUIDField(unique=True)
    statement = models.JSONField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    delivery_attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_error = models.TextField(blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["next_attempt_at", "created_at"]
        indexes = [
            models.Index(
                fields=["status", "next_attempt_at"],
                name="lab_xapidel_status_88c035_idx",
            )
        ]

    def __str__(self):
        return f"{self.statement_id} · {self.status}"


class StepResult(models.Model):
    class Outcome(models.TextChoices):
        PASSED = "passed", "Passed"
        FAILED = "failed", "Failed"
        REQUIRES_REVIEW = "requires_review", "Requires review"

    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="step_results")
    step_code = models.SlugField(max_length=80)
    outcome = models.CharField(max_length=24, choices=Outcome.choices)
    attempts_count = models.PositiveIntegerField(default=1)
    hints_used = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    achieved_points = models.DecimalField(max_digits=8, decimal_places=2)
    available_points = models.DecimalField(max_digits=8, decimal_places=2)
    tolerance_passed = models.BooleanField(null=True, blank=True)
    safety_violations = models.PositiveIntegerField(default=0)
    evidence_sequences = models.JSONField(default=list)
    completed_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "step_code"],
                name="unique_attempt_step_result",
            )
        ]
        ordering = ["attempt", "step_code"]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Step results are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Step results are immutable.")


class CompetencyResult(models.Model):
    class MasteryState(models.TextChoices):
        NOT_DEMONSTRATED = "not_demonstrated", "Not demonstrated"
        DEVELOPING = "developing", "Developing"
        MASTERED = "mastered", "Mastered"
        REQUIRES_REVIEW = "requires_review", "Requires review"

    attempt = models.ForeignKey(
        Attempt,
        on_delete=models.CASCADE,
        related_name="competency_results",
    )
    competency = models.ForeignKey(
        Competency,
        on_delete=models.PROTECT,
        related_name="results",
    )
    competency_code = models.CharField(max_length=60)
    achieved_points = models.DecimalField(max_digits=8, decimal_places=2)
    available_points = models.DecimalField(max_digits=8, decimal_places=2)
    mastery_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    mastery_threshold = models.PositiveSmallIntegerField(validators=[MaxValueValidator(100)])
    mastery_state = models.CharField(max_length=24, choices=MasteryState.choices)
    evidence = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "competency"],
                name="unique_attempt_competency_result",
            )
        ]
        ordering = ["attempt", "competency_code"]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Competency results are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Competency results are immutable.")


class KnowledgeCheckSubmission(models.Model):
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name="knowledge_checks",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="knowledge_check_submissions",
    )
    answers = models.JSONField(default=list)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "learner"],
                name="unique_assignment_learner_knowledge_check",
            )
        ]
        ordering = ["-submitted_at"]

    def clean(self):
        if self.assignment_id and self.learner_id != self.assignment.learner_id:
            raise ValidationError({"learner": "The submission must belong to the assignee."})
        if not isinstance(self.answers, list):
            raise ValidationError({"answers": "Answers must be a list."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class InstructorFeedback(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="feedback")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="attempt_feedback_authored",
    )
    observation = models.TextField(blank=True)
    feedback = models.TextField()
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        if self.is_published and self.published_at is None:
            self.published_at = timezone.now()
        self.full_clean()
        return super().save(*args, **kwargs)


class AdaptiveRecommendation(models.Model):
    class Kind(models.TextChoices):
        CONTINUE = "continue", "Continue"
        REMEDIATE = "remediate", "Remediate"
        RETRY = "retry", "Retry"
        INSTRUCTOR_REVIEW = "instructor_review", "Instructor review"
        COMPLETE = "complete", "Complete"

    attempt = models.ForeignKey(
        Attempt,
        on_delete=models.CASCADE,
        related_name="recommendations",
    )
    rule_version = models.CharField(max_length=80, default="transparent-rules-v1")
    kind = models.CharField(max_length=32, choices=Kind.choices)
    input_snapshot = models.JSONField(default=dict)
    rationale = models.TextField()
    confidence = models.DecimalField(max_digits=4, decimal_places=3, default=1)
    overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="adaptive_overrides",
        null=True,
        blank=True,
    )
    override_kind = models.CharField(
        max_length=32,
        choices=Kind.choices,
        null=True,
        blank=True,
    )
    override_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ResearchSurveyResponse(models.Model):
    class Instrument(models.TextChoices):
        TAM = "tam", "Technology Acceptance Model"
        SUS = "sus", "System Usability Scale"
        PRE_TEST = "pre_test", "Pre-test"
        POST_TEST = "post_test", "Post-test"
        TRANSFER = "transfer", "Practical transfer"
        INTERVIEW = "interview", "Interview"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="survey_responses")
    participant_code = models.CharField(max_length=80)
    instrument = models.CharField(max_length=24, choices=Instrument.choices)
    responses = models.JSONField(default=dict)
    consent_version = models.CharField(max_length=80)
    scenario_version = models.CharField(max_length=80, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school", "participant_code", "instrument", "scenario_version"],
                name="unique_participant_instrument_scenario",
            )
        ]
        ordering = ["-submitted_at"]

    def clean(self):
        if not isinstance(self.responses, dict):
            raise ValidationError({"responses": "Survey responses must be an object."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class ResearchConsentReceipt(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        WITHDRAWN = "withdrawn", "Withdrawn"
        EXPIRED = "expired", "Expired"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="consent_receipts")
    participant_code = models.CharField(max_length=80)
    consent_version = models.CharField(max_length=80)
    scenario_version = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    consented_at = models.DateTimeField(default=timezone.now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["school", "participant_code", "consent_version", "scenario_version"],
                name="unique_research_consent_receipt",
            )
        ]
        ordering = ["-consented_at"]

    def clean(self):
        if self.status == self.Status.WITHDRAWN and self.withdrawn_at is None:
            raise ValidationError({"withdrawn_at": "Withdrawal time is required."})
        if self.status == self.Status.ACTIVE and self.withdrawn_at is not None:
            raise ValidationError({"withdrawn_at": "Active consent cannot have a withdrawal time."})
        if self.expires_at <= self.consented_at:
            raise ValidationError({"expires_at": "Consent expiry must follow consent time."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class PilotStudy(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FROZEN = "frozen", "Protocol frozen"
        COLLECTING = "collecting", "Collecting evidence"
        CLOSED = "closed", "Collection closed"
        REVIEWED = "reviewed", "Independently reviewed"

    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name="pilot_studies")
    code = models.SlugField(max_length=80)
    title = models.CharField(max_length=180)
    scenario = models.ForeignKey(
        SimulationScenario,
        on_delete=models.PROTECT,
        related_name="pilot_studies",
    )
    cohort = models.ForeignKey(Cohort, on_delete=models.PROTECT, related_name="pilot_studies")
    protocol_version = models.CharField(max_length=80)
    consent_version = models.CharField(max_length=80)
    instruments = models.JSONField(default=dict)
    supported_devices = models.JSONField(default=list)
    analysis_plan = models.JSONField(default=dict)
    thresholds = models.JSONField(default=dict)
    protocol_snapshot = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_studies_created",
    )
    frozen_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_studies_frozen",
        null=True,
        blank=True,
    )
    frozen_at = models.DateTimeField(null=True, blank=True)
    collection_started_at = models.DateTimeField(null=True, blank=True)
    collection_closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "code"], name="unique_school_pilot_code")
        ]
        ordering = ["-created_at"]

    def clean(self):
        errors = {}
        if self.scenario_id and self.scenario.lesson.course.school_id != self.school_id:
            errors["scenario"] = "The pilot scenario must belong to the pilot school."
        if self.cohort_id and self.cohort.school_id != self.school_id:
            errors["cohort"] = "The pilot cohort must belong to the pilot school."
        if not isinstance(self.instruments, dict):
            errors["instruments"] = "Instruments must be an object."
        if not isinstance(self.supported_devices, list):
            errors["supported_devices"] = "Supported devices must be a list."
        if not isinstance(self.analysis_plan, dict):
            errors["analysis_plan"] = "The analysis plan must be an object."
        if not isinstance(self.thresholds, dict):
            errors["thresholds"] = "Thresholds must be an object."
        if self.status != self.Status.DRAFT and not self.protocol_snapshot:
            errors["protocol_snapshot"] = "A non-draft pilot requires an immutable snapshot."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.pk:
            previous = type(self).objects.filter(pk=self.pk).first()
            if previous is not None:
                transitions = {
                    self.Status.DRAFT: {self.Status.DRAFT, self.Status.FROZEN},
                    self.Status.FROZEN: {self.Status.FROZEN, self.Status.COLLECTING},
                    self.Status.COLLECTING: {self.Status.COLLECTING, self.Status.CLOSED},
                    self.Status.CLOSED: {self.Status.CLOSED, self.Status.REVIEWED},
                    self.Status.REVIEWED: {self.Status.REVIEWED},
                }
                if self.status not in transitions[previous.status]:
                    raise ValidationError(
                        "Pilot study status transitions must move forward in order."
                    )
                if previous.status != self.Status.DRAFT:
                    immutable_fields = [
                        "school_id",
                        "code",
                        "title",
                        "scenario_id",
                        "cohort_id",
                        "protocol_version",
                        "consent_version",
                        "instruments",
                        "supported_devices",
                        "analysis_plan",
                        "thresholds",
                        "protocol_snapshot",
                        "created_by_id",
                        "frozen_by_id",
                        "frozen_at",
                    ]
                    if any(
                        getattr(self, field) != getattr(previous, field)
                        for field in immutable_fields
                    ):
                        raise ValidationError(
                            "A frozen pilot protocol and its snapshot are immutable."
                        )
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.school.code} · {self.code} · {self.protocol_version}"


class PilotApproval(models.Model):
    class Domain(models.TextChoices):
        ETHICS = "ethics", "Ethics"
        PRIVACY = "privacy", "Privacy"
        SAFEGUARDING = "safeguarding", "Safeguarding"
        INSTRUCTOR = "instructor", "Qualified instructor"
        SAFETY = "safety", "Workshop safety"
        DEVICE = "device", "Device baseline"
        ACCESSIBILITY = "accessibility", "Accessibility"
        SECURITY = "security", "Security"
        OPERATIONS = "operations", "School operations"
        RECOVERY = "recovery", "Recovery"
        EVIDENCE = "evidence", "Research evidence"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    study = models.ForeignKey(PilotStudy, on_delete=models.CASCADE, related_name="approvals")
    domain = models.CharField(max_length=24, choices=Domain.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    approver_name = models.CharField(max_length=180, blank=True)
    approver_role = models.CharField(max_length=180, blank=True)
    organization = models.CharField(max_length=180, blank=True)
    evidence_reference = models.CharField(max_length=500, blank=True)
    scope = models.TextField(blank=True)
    decision_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_approvals_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["study", "domain"], name="unique_pilot_approval_domain")
        ]
        ordering = ["domain"]

    def clean(self):
        if self.status in {self.Status.APPROVED, self.Status.REJECTED}:
            missing = [
                field
                for field in [
                    "approver_name",
                    "approver_role",
                    "organization",
                    "evidence_reference",
                ]
                if not getattr(self, field).strip()
            ]
            if missing or self.decision_at is None:
                raise ValidationError(
                    "Decided approvals require a named approver, role, organization, evidence "
                    "reference, and decision time."
                )

    def save(self, *args, **kwargs):
        if self.pk:
            previous = type(self).objects.filter(pk=self.pk).first()
            if previous is not None and previous.status != self.Status.PENDING:
                raise ValidationError("A decided pilot approval is immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)


class PilotObservation(models.Model):
    class Instrument(models.TextChoices):
        PRE_TEST = "pre_test", "Pre-test"
        POST_TEST = "post_test", "Post-test"
        TRANSFER = "transfer", "Independent transfer rubric"
        SUS = "sus", "System Usability Scale"
        TAM = "tam", "Technology Acceptance Model"
        LEARNER_INTERVIEW = "learner_interview", "Learner interview codes"
        INSTRUCTOR_INTERVIEW = "instructor_interview", "Instructor interview codes"
        INSTRUCTOR_WORKLOAD = "instructor_workload", "Instructor workload"

    study = models.ForeignKey(PilotStudy, on_delete=models.PROTECT, related_name="observations")
    participant_code = models.CharField(max_length=80)
    instrument = models.CharField(max_length=32, choices=Instrument.choices)
    responses = models.JSONField(default=dict)
    consent_version = models.CharField(max_length=80)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_observations_recorded",
    )
    collected_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["study", "participant_code", "instrument"],
                name="unique_pilot_participant_instrument",
            )
        ]
        ordering = ["instrument", "participant_code"]

    def clean(self):
        if not isinstance(self.responses, dict):
            raise ValidationError({"responses": "Responses must be an object."})
        if self.study_id and self.consent_version != self.study.consent_version:
            raise ValidationError({"consent_version": "Consent version does not match the study."})

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Pilot observations are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Pilot observations are immutable; use the consent withdrawal flow.")


class PilotIncident(models.Model):
    class Kind(models.TextChoices):
        SAFETY = "safety", "Safety"
        USABILITY = "usability", "Usability"
        PRIVACY = "privacy", "Privacy"
        TECHNICAL = "technical", "Technical"
        SUPPORT = "support", "Support"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        ACCEPTED_RISK = "accepted_risk", "Accepted risk"

    study = models.ForeignKey(PilotStudy, on_delete=models.PROTECT, related_name="incidents")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    summary = models.CharField(max_length=500)
    resolution = models.TextField(blank=True)
    evidence_reference = models.CharField(max_length=500, blank=True)
    safety_critical = models.BooleanField(default=False)
    ar_caused_grading_penalty = models.BooleanField(default=False)
    occurred_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_incidents_reported",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-occurred_at"]

    def clean(self):
        if self.status != self.Status.OPEN and (
            not self.resolution.strip() or self.resolved_at is None
        ):
            raise ValidationError("Resolved or accepted incidents require a resolution and time.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class PilotRehearsal(models.Model):
    class Kind(models.TextChoices):
        INSTRUCTOR_TRAINING = "instructor_training", "Instructor training"
        CUSTODIAN_TRAINING = "custodian_training", "Device-custodian training"
        OUTAGE = "outage", "Outage and synchronization"
        FALLBACK = "fallback", "Fallback and accessibility"
        STOP = "stop", "Safety stop"
        USABILITY_SAFETY = "usability_safety", "Small usability and safety rehearsal"

    class Outcome(models.TextChoices):
        PASS = "pass", "Passed"
        ISSUES = "issues", "Issues found"
        FAIL = "fail", "Failed"

    study = models.ForeignKey(PilotStudy, on_delete=models.PROTECT, related_name="rehearsals")
    kind = models.CharField(max_length=32, choices=Kind.choices)
    outcome = models.CharField(max_length=16, choices=Outcome.choices)
    facilitator = models.CharField(max_length=180)
    participant_count = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    evidence_reference = models.CharField(max_length=500)
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_rehearsals_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["kind", "completed_at", "created_at"]

    def clean(self):
        if not all(value.strip() for value in [self.facilitator, self.evidence_reference]):
            raise ValidationError("A rehearsal requires a facilitator and evidence reference.")

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Pilot rehearsal evidence is immutable; record a new run.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Pilot rehearsal evidence is immutable.")


class PilotReview(models.Model):
    class Decision(models.TextChoices):
        EXPAND = "expand", "Approve expansion"
        LIMIT = "limit", "Continue with limits"
        REJECT = "reject", "Reject expansion"

    study = models.OneToOneField(PilotStudy, on_delete=models.PROTECT, related_name="review")
    decision = models.CharField(max_length=16, choices=Decision.choices)
    reviewer_name = models.CharField(max_length=180)
    reviewer_role = models.CharField(max_length=180)
    organization = models.CharField(max_length=180)
    evidence_reference = models.CharField(max_length=500)
    rationale = models.TextField()
    limitations = models.TextField()
    independent_confirmed = models.BooleanField(default=False)
    decided_at = models.DateTimeField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pilot_reviews_recorded",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-decided_at"]

    def clean(self):
        if not self.independent_confirmed:
            raise ValidationError("The reviewer must be confirmed independent of implementation.")
        if not all(
            value.strip()
            for value in [
                self.reviewer_name,
                self.reviewer_role,
                self.organization,
                self.evidence_reference,
                self.rationale,
                self.limitations,
            ]
        ):
            raise ValidationError(
                "A review requires reviewer details, evidence, rationale, and limitations."
            )

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError("Independent pilot reviews are immutable.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Independent pilot reviews are immutable.")


class AuditEvent(models.Model):
    event_type = models.CharField(max_length=100)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    school = models.ForeignKey(
        School,
        on_delete=models.SET_NULL,
        related_name="audit_events",
        null=True,
        blank=True,
    )
    target_type = models.CharField(max_length=80, blank=True)
    target_id = models.CharField(max_length=80, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [models.Index(fields=["event_type", "-occurred_at"])]

    def __str__(self):
        return f"{self.event_type} · {self.occurred_at.isoformat()}"
