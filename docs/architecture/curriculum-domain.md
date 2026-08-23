# Curriculum and school organization domain

OPedu's initial normalized hierarchy is:

`School → Program → Course → Module → Lesson → ProcedureStep`

Learners participate through:

`School → Cohort → Enrollment → Learner`

## Invariants

- A program belongs to exactly one school.
- A course may retain no program temporarily for migration compatibility. When it has a program, the course and program must belong to the same school.
- A module belongs to exactly one course.
- A lesson may retain no module temporarily. When it has a module, that module must belong to the lesson's course.
- A cohort and its program must belong to the same school.
- An enrollment requires an active learner membership in the cohort's active school.
- Program, module, cohort, and enrollment codes or relationships are unique within their parent scope.

The nullable course-program and lesson-module links are migration bridges for existing content, not the desired state for newly authored content.

## Competency and lesson governance

Competencies carry a curriculum reference, level from 1 through 8, structured evidence rules, mastery criteria, and a mastery threshold. Lessons may declare same-course prerequisites, use English, Kinyarwanda, or bilingual content, and expose a positive content version.

Lesson publication follows `draft → review → approved → published → retired`. A school content author may submit a lesson they own. A school administrator reviews, approves, publishes, returns content with mandatory notes, or retires it. Every accepted transition records its actor, timestamps, version, previous state, next state, and an immutable administrative audit event. Queries are scoped to schools where the actor has an active content-author or administrator membership.

The lesson content version identifies the current lesson record; it does not yet make assessment results reproducible after scenario changes. Immutable scenario and grading-policy versions remain a separate Batch 3 requirement.

## Profiles and data minimization

The generic profile containing birth date, organization text, and phone number was removed in migration `0008`. Organization is derived from active school membership. `LearnerProfile` stores only student identifier, preferred language, and learning accommodations; `InstructorProfile` stores employee identifier, qualifications, and biography. Invitation acceptance creates the matching role profile automatically.

Migration `0008` backfills empty learner and instructor profiles for existing active memberships before deleting the old profile table.
