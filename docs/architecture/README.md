# Architecture documentation

Architecture decisions are recorded as immutable ADRs. Superseded decisions remain in this directory and link to their replacement.

The current authorization matrix is documented in `role-permissions.md`.
The normalized school and curriculum hierarchy is documented in `curriculum-domain.md`.
Lesson and competency governance is documented in `curriculum-domain.md`, including publication transitions and audit requirements.
Immutable assessment content, grading policies, and asset packages are documented in `content-versioning.md`.
Normalized procedure authoring and materialized assessment evidence are documented in `assessment-evidence.md`.
The shared accessible, desktop, marker, and markerless renderer contract is documented in `webar-runtime.md`.
WebAR trust boundaries, principal threats, and privacy constraints are documented in `security-threat-model.md`.
Research consent, withdrawal, retention, deletion, access, and incident operations are documented
in `../operations/research-data-rights.md`.
All school, instructor, physical-device, legal, independent-review, production-provider, and pilot
evidence still required for release is accounted for in `../operations/external-release-gates.md`.
The automated implementation evidence from the approved execution session is recorded in
`../operations/implementation-verification-2026-08-22.md`.

- `0001-platform-architecture.md` — React/Django modular monolith and desktop-first simulation delivery.
