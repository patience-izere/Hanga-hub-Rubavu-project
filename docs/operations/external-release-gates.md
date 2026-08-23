# External release-gate register

Status: 73 open items in `AR_IMPLEMENTATION_TODO.md` as of 22 August 2026. This register groups
every open item without treating browser emulation, generated content, or developer judgment as a
substitute for school, instructor, hardware, legal, security, or pilot evidence.

| Gate group | Open items | Required owner/input | Evidence required to close | Repository follow-up after approval |
| --- | ---: | --- | --- | --- |
| Curriculum, safety, institution, device and language baseline | 14 | Pilot-school lead, qualified technical instructor, safety lead, device custodian, privacy lead and translation owners | Named competency standard; signed de-energized/mock-rig procedure; spatial-step and independent-transfer definitions; school/device/browser inventory; language/LMS/LRS decisions; approved Batch 0 pack | Record identifiers, thresholds, owners and dates; freeze the approved data map, scenario and evaluation plan |
| Licensed production rig and asset pipeline | 8 | Asset owner/licensor, 3D specialist, instructor and lowest-device test owner | Rights ledger for every retained asset; dimensionally checked rig glTF; approved pivots, targets, colliders, safety zones and anchors; measured asset budgets | Replace procedural placeholder; add only device-proven Meshopt/Draco and KTX2; generate tested quality variants and thumbnails |
| Physical AR alignment and device validation | 12 | Instructor, safety owner and device lab with the actual rig and supported phones/tablets | Instructor-reviewed 2D/3D parity; camera and marker/surface recognition recordings; registration drift, latency, false-placement, low-light, interruption, relocalization, thermal and fallback results | Tune anchors/overlays and optional depth, lighting or occlusion features without changing grading; add captured devices to the matrix |
| xAPI and recommendation acceptance | 3 | Institution's learning-data owner, optional LRS owner and pilot researchers | Approved xAPI vocabulary/activity identifiers and retention; LRS decision; recommendation-usefulness results | Configure HTTPS LRS only if approved, run delivery/dead-letter acceptance, and retain the approved vocabulary version |
| Pilot authorization and rehearsal | 4 | Ethics/privacy/safeguarding authority, school lead, instructors and custodians | Approved consent/withdrawal/incident materials; training attendance; outage/stop/fallback rehearsal; frozen protocol; small safety/usability rehearsal | Change research status from `draft` only after approval, record immutable consent version, and freeze release artifacts |
| Consented pilot measurements | 8 | Research lead, learners, instructors and data analyst | Pre/post and transfer results; SUS/TAM; recognition/latency/fallback by device; AR/fallback parity; operational burden; reliability/missing-data analysis; coded interviews | Import only approved pseudonymous results, publish analysis with uncertainty and retain the approved deletion schedule |
| Success thresholds and independent go/no-go | 8 | Safety, instructor, research and independent review board | Safety-defect disposition; evidence parity; approved SUS threshold; spatial accuracy/latency; real outage sync; learning/transfer uncertainty; acceptable workload; signed expansion decision | Record the decision and limitations; do not infer effectiveness from engagement or automated tests |
| Production assurance and replication | 6 | Hosting/operations, accessibility, privacy, security and recovery reviewers plus multiple schools | Physical browser/device matrix; current provider backup/restore drill including object storage; accessibility/privacy/security reviews; constrained-network and classroom acceptance; multi-school replication; named release sign-off | Configure provider lifecycle/alerts and approval workflow; attach restore evidence and signed release record |
| Final WebAR qualification | 10 | Combined instructor, school, hardware, safety, accessibility, privacy, safeguarding, security, operations and research owners | Live mobile-camera session; stable real-object/surface alignment; instructionally useful real-procedure overlays; equivalent fallback; recovery acceptance; lowest-device budgets; separate recognition metrics; instructor approval; assurance approvals; honest pilot report | Change product claim from “WebAR pilot candidate” only when all ten artifacts are present |
| **Total** | **73** |  |  |  |

## Evidence rules

- Every approval must name the owner, role, organization, artifact version, date and scope. A chat
  message or checked developer box is not safety, ethics, privacy, instructor or production approval.
- Device evidence must record model, OS, browser/version, memory/storage, camera conditions,
  connection profile, scenario/asset/release versions and repeated measurements. Emulator results
  remain useful regression evidence but do not qualify a physical device.
- Pilot evidence must be consented and pseudonymous, preserve withdrawals, report missing data and
  uncertainty, and keep recognition quality separate from learner competency.
- A provider restore gate requires a fresh backup of the current migration chain through `0019`, a
  private object-store recovery test, an isolated restore, data-count checks and learner/instructor
  smoke tests. The 2026-07-17 drill is historical evidence, not the current production-provider gate.
- The canonical item-level status remains `AR_IMPLEMENTATION_TODO.md`; this grouped register must be
  updated whenever an item changes state.
