import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lab", "0003_threedmodel"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="School",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=180)),
                ("code", models.SlugField(max_length=60, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Course",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=180)),
                ("slug", models.SlugField(max_length=180, unique=True)),
                ("trade", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("is_published", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("school", models.ForeignKey(blank=True, help_text="Leave empty for platform-wide content.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="courses", to="lab.school")),
            ],
            options={"ordering": ["title"]},
        ),
        migrations.CreateModel(
            name="Competency",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=60)),
                ("title", models.CharField(max_length=180)),
                ("description", models.TextField(blank=True)),
                ("mastery_threshold", models.PositiveSmallIntegerField(default=80)),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="competencies", to="lab.course")),
            ],
            options={"ordering": ["code"], "verbose_name_plural": "competencies"},
        ),
        migrations.CreateModel(
            name="Lesson",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=180)),
                ("slug", models.SlugField(max_length=180)),
                ("summary", models.TextField()),
                ("objectives", models.JSONField(blank=True, default=list)),
                ("safety_notes", models.JSONField(blank=True, default=list)),
                ("estimated_minutes", models.PositiveSmallIntegerField(default=30)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("review", "In review"), ("published", "Published"), ("retired", "Retired")], default="draft", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("competencies", models.ManyToManyField(blank=True, related_name="lessons", to="lab.competency")),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lessons", to="lab.course")),
            ],
            options={"ordering": ["course__title", "title"]},
        ),
        migrations.CreateModel(
            name="SchoolMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("admin", "School administrator"), ("instructor", "Instructor"), ("learner", "Learner"), ("content_author", "Content author")], max_length=24)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("school", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="lab.school")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="school_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["school__name", "user__username"]},
        ),
        migrations.CreateModel(
            name="Assignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("due_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("assigned_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assignments_created", to=settings.AUTH_USER_MODEL)),
                ("learner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_assignments", to=settings.AUTH_USER_MODEL)),
                ("lesson", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assignments", to="lab.lesson")),
            ],
            options={"ordering": ["due_at", "-created_at"]},
        ),
        migrations.CreateModel(
            name="Attempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("in_progress", "In progress"), ("completed", "Completed"), ("requires_review", "Requires review")], default="in_progress", max_length=24)),
                ("score", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("resume_state", models.JSONField(blank=True, default=dict)),
                ("started_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attempts", to="lab.assignment")),
                ("learner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_attempts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-started_at"]},
        ),
        migrations.CreateModel(
            name="AttemptEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sequence", models.PositiveIntegerField()),
                ("event_type", models.CharField(max_length=80)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("occurred_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("attempt", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="lab.attempt")),
            ],
            options={"ordering": ["sequence"]},
        ),
        migrations.AddConstraint(model_name="competency", constraint=models.UniqueConstraint(fields=("course", "code"), name="unique_course_competency_code")),
        migrations.AddConstraint(model_name="competency", constraint=models.CheckConstraint(condition=models.Q(mastery_threshold__lte=100), name="competency_threshold_lte_100")),
        migrations.AddConstraint(model_name="lesson", constraint=models.UniqueConstraint(fields=("course", "slug"), name="unique_course_lesson_slug")),
        migrations.AddConstraint(model_name="schoolmembership", constraint=models.UniqueConstraint(fields=("school", "user"), name="unique_school_membership")),
        migrations.AddConstraint(model_name="assignment", constraint=models.UniqueConstraint(fields=("lesson", "learner"), name="unique_lesson_learner_assignment")),
        migrations.AddConstraint(model_name="attemptevent", constraint=models.UniqueConstraint(fields=("attempt", "sequence"), name="unique_attempt_event_sequence")),
    ]
