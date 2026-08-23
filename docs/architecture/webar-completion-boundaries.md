# WebAR completion boundaries

## Implemented software boundary

The OPedu learner runtime now selects accessible 2D, desktop 3D, marker camera AR, or markerless
WebXR from an explicit capability profile. Guided practice and independent assessment share the
same action codes and server grading. Independent mode hides ordered prompts, active-step cues,
hints, and answer-revealing camera controls. Ending an attempt preserves its immutable evidence and
creates a new attempt from the safe beginning.

Published asset files are downloaded through a typed loader that reports progress, supports
cancellation and retry, verifies byte size and SHA-256, removes an invalid cache entry, and uses the
procedural scene if the verified model cannot load. Offline actions retain original UUIDs and client
times; a scenario-version mismatch is retained as stale evidence rather than silently replayed.
Offline-capable React Query operations run even when the browser reports no connection, and all
automatic/manual synchronization triggers share one in-flight replay. A browser test downloads the
lesson shell, blocks every API request, completes the ordered actions, reconnects, proves one request
per UUID, and completes server scoring. This is software evidence, not a substitute for the required
lowest-device and constrained-school-network acceptance run.

Mobile Chromium emulation also verifies portrait-to-landscape continuity, camera interruption,
permission denial, preserved progress, and access to the equivalent 2D fallback. Physical-camera,
marker-alignment, low-light, tracking, battery, and thermal acceptance remain external gates.

The content workflow provides structured procedure and anchor editing, glTF/media upload, generated
checksums and metrics, SPDX attribution, accessibility metadata, publication completeness checks,
review/approval/publication/retirement, and immutable version cloning. Draft uploads accept glTF 2.0,
GLB, KTX2, PNG/JPEG/WebP, MP4/WebM, and VTT within the configured upload limit. Publication applies
the manifest's byte, triangle, draw-call, material, and texture-dimension budgets where supplied.

## xAPI boundary

Authoritative attempt events project deterministically to pseudonymized xAPI 1.0.3 statements. The
event UUID is the statement UUID, so repeated projection cannot create a different statement.
Completion places each conformant statement in `XApiDelivery`. Delivery is disabled until
`OPEDU_LRS_ENDPOINT` is approved and configured. When enabled, run:

```powershell
python manage.py deliver_xapi --limit 100
```

The command requires HTTPS, uses xAPI `PUT` with the stable statement ID, retries with exponential
backoff, and exposes exhausted items as dead letters in Django administration. Credentials are read
from `OPEDU_LRS_KEY` and `OPEDU_LRS_SECRET`; they must be supplied through the deployment secret
store, never committed.

## Evidence that software cannot manufacture

The application is not yet qualified for a production WebAR claim. The remaining gates require a
named competency standard and qualified instructor, an approved de-energized or mock training rig,
licensed dimensionally accurate production assets, named devices and browsers, physical marker and
markerless alignment measurements, safety/privacy/accessibility/security approvals, and a consented
school pilot. Automated simulation, browser emulation, and unit tests cannot substitute for those
sign-offs or measured field evidence.
