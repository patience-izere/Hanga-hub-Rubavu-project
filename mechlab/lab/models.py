from django.conf import settings
from django.core.exceptions import ValidationError
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

    def __str__(self):
        return f"{self.code} · {self.title}"


class Lesson(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEW = "review", "In review"
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
    title = models.CharField(max_length=180)
    slug = models.SlugField(max_length=180)
    summary = models.TextField()
    objectives = models.JSONField(default=list, blank=True)
    safety_notes = models.JSONField(default=list, blank=True)
    estimated_minutes = models.PositiveSmallIntegerField(default=30)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
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

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

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


class Assignment(models.Model):
    lesson = models.ForeignKey(Lesson, on_delete=models.PROTECT, related_name="assignments")
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
    due_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["lesson", "learner"], name="unique_lesson_learner_assignment"
            )
        ]
        ordering = ["due_at", "-created_at"]

    def __str__(self):
        return f"{self.lesson.title} → {self.learner.get_username()}"


class Attempt(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        REQUIRES_REVIEW = "requires_review", "Requires review"

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="attempts")
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_attempts",
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.IN_PROGRESS)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    resume_state = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Attempt {self.pk} · {self.assignment.lesson.title}"


class AttemptEvent(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="events")
    sequence = models.PositiveIntegerField()
    event_type = models.CharField(max_length=80)
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "sequence"], name="unique_attempt_event_sequence"
            )
        ]
        ordering = ["sequence"]

    def __str__(self):
        return f"{self.attempt_id}:{self.sequence} · {self.event_type}"


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
