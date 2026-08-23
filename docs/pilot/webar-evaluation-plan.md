# WebAR technical-school pilot evaluation plan

Status: implementation-ready template; institution, ethics, instructor, device, and participant
approvals remain external gates.

The executable platform workflow, measures, decision rules, and boundary between implemented
software and live-school evidence are documented in
[Batch 11 technical-school pilot workflow](./batch11-pilot-workflow.md).

## Pilot questions and measures

- Learning: aligned pre/post test, normalized gain, paired analysis, effect size, and uncertainty.
- Transfer: instructor-blinded physical-task rubric for sequence, accuracy, safety, time, and help.
- Acceptance: standard 10-item SUS plus TAM usefulness, ease, enjoyment, and intention.
- AR: recognition success, false placement, latency, tracking loss, re-scans, fallback, and crash.
- Equity: completion and outcome parity by renderer, device tier, and network profile.
- Operations: download/sync time, conflicts, storage, support incidents, and instructor workload.
- Qualitative evidence: learner and instructor interviews on cognitive load, safety, and access.

## Data controls

Research responses use a school-scoped HMAC participant code rather than a username or email.
Consent version and scenario version are stored with each response. Operational PostgreSQL
records and research exports remain separate. Withdrawal, retention, deletion, access, breach,
and cross-border processes must be approved before recruitment.

## Proposed gates

- No unresolved safety-critical defect or AR-caused grading penalty.
- Equivalent required evidence through AR and fallback.
- Median SUS at least 70, subject to institutional research approval.
- Procedure-specific recognition and latency limits pass on the lowest supported device.
- Offline evidence synchronizes exactly once without lost accepted events.
- Physical transfer is independently scored; engagement is not treated as learning.
- Instructor workload and support burden are accepted by the school.

The dissertation did not execute its proposed pilot. OPedu must publish actual results,
limitations, missing data, device coverage, and uncertainty before making effectiveness claims.
