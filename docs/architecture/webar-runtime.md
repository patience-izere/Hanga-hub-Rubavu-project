# WebAR runtime and renderer contract

## Decision

OPedu keeps React as the capability-aware client and Django/PostgreSQL as the authoritative
learning and evidence system. AR is a renderer, not a separate grading application.

Supported renderer identifiers are:

- `accessible_2d`: required equivalent procedure controls and media.
- `desktop_3d`: React Three Fiber workshop.
- `marker_ar`: rear-camera WebAR with QR/fiducial registration and a controlled-rig fallback.
- `markerless_ar`: WebXR `immersive-ar` with hit testing and optional anchors/local-floor support.

Every renderer invokes the same stable scenario action codes. Django validates order,
tolerances, safety state, scoring, step results, and competency results. Recognition,
placement, tracking, camera permission, and fallback events never change marks.

## Capability selection

The client records a minimal capability profile: secure context, camera API, WebGL,
`immersive-ar`, hit testing, barcode detector availability, network class, approximate device
memory, online state, and reduced-motion preference. The learner can always choose an
available fallback. The chosen renderer and capability profile are stored on the attempt.

## Stable evidence

Each event has a globally unique UUID, server sequence, schema version, stable activity URI,
renderer context, server occurrence/receipt times, optional client time, and JSON payload.
Client UUIDs make offline replay idempotent. Reusing an event UUID on another attempt is a
conflict. PostgreSQL remains authoritative; xAPI statements are deterministic projections of
immutable events.

## Offline model

The PWA stores pending actions and AR telemetry in an IndexedDB outbox. Correct offline actions
advance only the local resume projection. On reconnect, actions are replayed in original order
and validated by Django. Final grading remains disabled until pending evidence is synchronized.
Rejected/conflicting items remain in the outbox for review.

## Safety boundary

Camera/AR lessons are for an instructor-approved, de-energized training rig or mock-up. The UI
must expose camera denial, unsupported device, low light, tracking loss, re-scan, exit, and
fallback paths. AR supplements supervised workshop practice and never authorizes energization or
hazardous equipment operation.

