# OPedu role and permission policy

OPedu uses one platform role and four school-scoped roles. Permissions are deny-by-default: a new mutation endpoint must name its required permission class and still scope every queryset to the relevant school.

| Role | Scope | Allowed responsibilities | Explicitly excluded |
| --- | --- | --- | --- |
| Platform administrator | Entire installation | Django administration, platform configuration, cross-school incident response | Routine teaching or learner participation |
| School administrator | One school | Invitations, membership activation, school access review, instructor evidence | Access to another school |
| Instructor | One school | Assigned learner evidence, attempt review, future assignment and feedback workflows | Membership administration and content publication |
| Content author | One school | Future draft lesson and simulation-authoring workflows | Learner evidence, membership administration, final publication without review |
| Learner | One school | Assigned lessons, own attempts, own results | Other learners' evidence and administrative actions |

## Identity mapping

- A platform administrator is an active Django superuser. `is_staff` alone only grants eligibility for Django Admin where model permissions allow it; it is not a platform-wide API role.
- School roles are active `SchoolMembership` records connected to an active `School`.
- A user may belong to more than one school. Object-level access must therefore filter by both the authenticated user and the target school; a coarse role check alone is never sufficient.
- Platform administrators may pass school-role permission classes for operational recovery. Views must still make deliberate decisions about any cross-school query.

## Reusable backend permissions

- `IsPlatformAdministrator`
- `IsSchoolAdmin`
- `IsInstructorOrSchoolAdmin`
- `IsContentAuthorOrSchoolAdmin`
- `IsLearner`

Use `has_active_school_role(user, roles, school=school)` when a service or object-level check must verify membership in a specific school.

## Mutation and audit rule

Membership changes, invitations, assignment changes, content state changes, grading, and instructor feedback must append an immutable `AuditEvent`. Audit records must not contain invitation tokens, passwords, reset tokens, or unnecessary learner personal data.
