# Implementation verification — 23 August 2026

Scope: repository-owned OPedu WebAR backlog after the project owner's approval. This record proves
the automated software boundary only; it does not close any school, instructor, legal, physical
hardware, independent-review, hosting-provider or real-pilot gate.

## Results

| Verification | Result |
| --- | --- |
| Django migrations | Current through `lab.0022_alter_pilotrehearsal_options_and_more`; no model drift |
| Django system check | Passed |
| Django tests | 57 passed |
| Python Ruff lint/format | Passed |
| OpenAPI | Generated and validated with no warning; React types regenerated |
| Asset governance | 1 governed package passed; unversioned public 3D assets rejected by command tests |
| Event/xAPI contracts | 15 event types and 4 renderers passed; LRS correctly disabled without approval |
| Research retention | Expiry dry run passed; no expired receipts in local verification data |
| React unit tests | 12 passed across 4 files |
| React lint/format/TypeScript | Passed |
| Production frontend build | Passed; 12 emitted files, 1,512,382 bytes total, enforced budget passed |
| JavaScript dependency audit | 0 known vulnerabilities at the configured audit level |
| Playwright | 19 passed; 4 intentional desktop/mobile project-mode skips |
| Production Django deployment check | Passed with `DEBUG=false`, HTTPS/HSTS, secure cookies, required Redis and private signed S3-compatible media |
| Production frontend image | Docker build passed; NGINX configuration test passed |
| Worktree whitespace check | Passed; line-ending conversion notices only |

## Browser evidence covered

- Public accessibility scan, keyboard skip navigation and visual snapshot.
- Portrait/landscape continuity and cached application-shell outage navigation.
- Learner sign-in/protected route/sign-out and school-role route isolation.
- Full API outage after download, local ordered completion, reconnect, exactly one request for each
  original event UUID, scenario/renderer sync metadata, and final server score.
- Mobile camera-orientation change and interruption without progress loss.
- Mobile camera permission denial with an accessible, progress-preserving 2D fallback.
- School-administrator access to the lazy-loaded frozen pilot-evidence workflow.

## Batch 11 software evidence covered

- Forward-only draft/freeze/collect/close/review lifecycle with a versioned immutable protocol
  snapshot and school/role boundaries.
- Named approvals, append-only rehearsal runs, incident handling, current consent, pseudonymous
  collection, withdrawal, immutable observations and immutable independent review.
- Validated pre/post, transfer, SUS, TAM, instructor workload and controlled interview-code
  instruments.
- Paired change, normalized gain, effect size, uncertainty, reliability, device-tier recognition,
  AR/fallback parity, workload/operations, missing/excluded records and explicit gate reporting.
- Browser delivery ledger plus immutable backend UUID reconciliation for real offline attempts.
- Expansion blocked when evidence fails or is insufficient; limit/reject remains available to the
  independent reviewer.

These checks use Chromium and mobile emulation. They do not prove camera quality, real marker or
surface alignment, low light, device heat/battery, or constrained school Wi-Fi on a physical device.

## Security and privacy evidence covered

- No hard-coded production `DEBUG` or secret-key override remains in Django settings.
- Production startup requires an explicit immutable release, HTTPS frontend URL, PostgreSQL, Redis
  and private object storage unless a deployment deliberately changes the requirement flags.
- Media uses non-overwriting private keys, server-side encryption and short-lived signed URLs.
- Browser errors are reduced to an authenticated random event ID, enumerated kind, path without
  query/fragment and release; messages, stacks, learner data and device fingerprints are rejected.
- Research submission stays unavailable while consent status is `draft`; approved submissions
  require the active version and create a withdrawable, expiring pseudonymous receipt.
- Legacy 3D files without verified rights are quarantined outside public static delivery.

## Remaining release boundary

`AR_IMPLEMENTATION_TODO.md` records 143 checked and 73 open items. The Batch 11 software-enablement
items are closed, while its original live-pilot outcomes remain open. All 73 open items are grouped by
owner, evidence and follow-up in `external-release-gates.md`. Until those artifacts exist, the
accurate description is **WebAR pilot candidate**, not a production-qualified or globally validated
WebAR platform.
