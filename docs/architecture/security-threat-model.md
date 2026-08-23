# WebAR security and privacy threat model

## Protected assets

School membership, learner identity, assessment evidence, instructor feedback, research consent,
scenario/grading integrity, AR asset integrity, credentials, and operational availability are the
primary assets. PostgreSQL is authoritative; IndexedDB and Cache Storage contain temporary local
copies on a learner-controlled or school-managed device.

## Trust boundaries and controls

- Browser to Django: HTTPS, session authentication, CSRF, secure cookies, CSP, trusted origins,
  request-size limits, request IDs, and server-side permission checks.
- School boundary: every roster, assignment, review, authoring, export, invitation, and survey
  query is school scoped. Client role checks are presentation only.
- Offline boundary: UUID event IDs, ordered replay, backend uniqueness, cross-attempt conflict
  rejection, and retained failed outbox items prevent silent duplicate or lost evidence.
- Camera/WebXR boundary: explicit user activation, camera-only Permissions Policy, no audio or
  geolocation, local marker recognition, and recognition telemetry separated from grades.
- Content boundary: immutable published versions, checksums, MIME/extension/license metadata,
  quality budgets, and draft-only editing. A real provider must add malware scanning and private
  object delivery.
- Research boundary: consent version, school-scoped pseudonyms, no email in research CSV/xAPI,
  and separation from operational exports.

## Principal threats

Cross-school access, forged actions, UUID replay, CSRF, malicious uploads, marker substitution,
unsafe or misleading overlays, camera overreach, shared-device leakage, stale offline content,
denial of service, excessive telemetry, and administrator misuse require testing. Current controls
reduce but do not eliminate these risks. Independent penetration testing, privacy review, device
inspection, upload scanning, retention approval, and incident rehearsal remain mandatory gates.

The platform never infers emotion, records audio, performs biometric analysis, or uses tracking
quality as competence. Request logs exclude query strings, request bodies, usernames, camera
frames, and raw capability fingerprints.
