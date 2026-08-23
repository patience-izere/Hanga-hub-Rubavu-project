# Batch 11 technical-school pilot workflow

Status: software workflow implemented; live institutional approvals, recruitment, measurements,
school acceptance, and the independent expansion decision remain external evidence gates.

## What the platform now supports

The pilot console is available to authorized instructors and school administrators at
`/research/pilots`. Its API is rooted at `/api/v1/research/pilots/`.

The workflow enforces this forward-only lifecycle:

1. Create a school-scoped draft linked to one published scenario and active cohort.
2. Freeze the scenario definition, grading policy, asset manifest and checksum, protocol,
   consent version, instruments and hashes, device profiles, analysis plan, and thresholds.
3. Record named approval evidence and every training/rehearsal run. A later rehearsal does not
   overwrite an earlier failure or issue.
4. Start collection only after the required approval domains and six rehearsals pass and no open
   high/critical incident remains.
5. Collect validated, pseudonymized observations while current consent remains active.
6. Close collection, inspect missing and excluded records, calculated measures, and every gate.
7. Record one immutable independent decision: expand, continue with limits, or reject. Expansion
   is blocked unless every configured gate passes.

Frozen studies cannot be edited or moved backward. Decided approvals, observations,
synchronization receipts, rehearsal runs, and independent reviews retain their original evidence.
Changes require a new protocol version or a new evidence record. Consent withdrawal removes that
participant's pilot observations while retaining the minimum withdrawal receipt required by the
research-data process.

## Measures implemented

- Paired pre/post scores, normalized gain, mean change, Cohen's dz, and a paired 95% confidence
  interval when the sample supports it.
- Independent physical-transfer rubric scores for sequence, accuracy, safety, time, independence,
  duration, and critical-safety failure.
- Correct 10-item SUS scoring and median/mean, with Cronbach's alpha where estimable.
- TAM usefulness, ease, enjoyment, and intention means and reliability where estimable.
- Recognition success, false placements, recognition latency, tracking loss, re-scans, and
  fallback events overall and by captured device tier.
- Completion, outcomes, and mean scores by renderer, plus explicit AR-versus-fallback completion
  and score gaps.
- Asset-load failures, low-frame-rate samples, offline attempts, reconciliation receipts, missing
  event UUIDs, synchronization failure signals, downloads, download failures, crashes, storage,
  support incidents, synchronization incidents, and instructor workload.
- Controlled learner/instructor interview theme codes and redacted summaries. Raw interview
  transcripts are intentionally not accepted.
- Expected and observed participants, missing counts by learner instrument, and an explicit
  excluded-record section. Validated records are never silently excluded.

Offline completion is not accepted as “exactly once” merely because an HTTP request succeeded.
The client keeps a delivery ledger and submits the delivered event UUIDs after the outbox is empty.
The backend stores an immutable receipt comparing those UUIDs with accepted PostgreSQL events.
The pilot gate passes only when every real offline attempt has a passing reconciliation, no pending
or missing UUIDs, and no failed synchronization signal.

## Configured decision gates

The frozen protocol includes minimum median SUS, minimum recognition success, maximum recognition
latency, maximum AR/fallback completion-rate gap, maximum AR/fallback mean-score gap, and maximum
instructor preparation/support minutes. The report additionally requires:

- no unresolved safety-critical incident or AR-caused grading penalty;
- real evidence from both AR and fallback groups;
- a reconciled offline attempt rather than a synthetic “zero failures” result;
- school acceptance of instructor workload; and
- named approval evidence for every final approval domain.

A missing measure produces `insufficient`, not a pass. A limit/reject review can be recorded when
evidence is incomplete or fails. An expand review cannot.

## What must happen in a real school

The software cannot approve ethics, privacy, safeguarding, workshop safety, accessibility,
security, operations, recovery, or research quality. It cannot train staff, recruit learners,
observe physical skills, decide whether workload is acceptable, or act as an independent reviewer.

Before any scaling claim, the participating school and research owners must therefore:

1. Replace all template instrument/device references with controlled approved artifacts and real
   SHA-256 values.
2. Obtain and record the named approvals, current consent material, withdrawal contact, incident
   route, and retention decision.
3. Run and record training plus outage, fallback, stop, recovery, usability, and safety rehearsals.
4. Recruit only after those prerequisites pass; then collect the live cohort's measures on the
   frozen supported and unsupported device profiles.
5. Resolve incidents, close collection, export/archive the evidence under the approved policy, and
   have an independent body record the final go/limit/no-go decision.

Until those steps produce evidence, all original Batch 11 outcome checkboxes remain open and no
effectiveness or scale claim is justified.
