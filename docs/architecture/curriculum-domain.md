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

## Profiles and data minimization

The generic profile containing birth date, organization text, and phone number was removed in migration `0008`. Organization is derived from active school membership. `LearnerProfile` stores only student identifier, preferred language, and learning accommodations; `InstructorProfile` stores employee identifier, qualifications, and biography. Invitation acceptance creates the matching role profile automatically.

Migration `0008` backfills empty learner and instructor profiles for existing active memberships before deleting the old profile table.
