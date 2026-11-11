# Learner experience and open access

This note describes what a lesson author can now put in a scenario, and how people reach the
platform. It complements `current-mvp.md`.

## Scenario extensions

All fields are optional. Existing published scenarios keep working unchanged.

| Field | Where | What it does |
|---|---|---|
| `choices` | step | Options shown for a decision step. Must include the step's `action_code`. |
| `mistakes` | step, or definition for distractors | `{action_code: {effect, message}}`. Effects: `spark`, `blown_fuse`, `wrong_reading`, `hazard`, `damage`, `none`. The learner sees the message; the effect drives sound, vibration and the scene. Mistakes are scored exactly as before. |
| `variants` | definition | Equivalent fault cases. Each overrides some steps (reading, tolerance, correct answer, feedback). A new attempt avoids the case the learner had last. |
| `sequence` | definition | `"free"` lets steps be done in any order (hazard hunts). Default `"ordered"`. |
| `knowledge_check` | definition | Multiple-choice questions with `answer` and `explanation`. Answers stay on the server until the learner submits. |
| `scene` | definition | Props from the shared library, bindings from parts to actions or tools, and effects that change what finished actions look like. Lessons without a scene get labelled blocks. A target's `accepts` value may be a list: the first action not yet done (a tester proved before and after). |
| `distractors` | definition | Things that look wrong but are fine (`action_code`, `label`), offered among the actions; their messages live in the definition's `mistakes`. A distractor cannot also be a correct action. |

Publication checks (`scenario_validation.py`) reject choices without the correct action, fault
cases that change unknown steps, quiz questions without a valid answer, distractors that are also
correct, and broken scenes (duplicate prop ids, bindings to missing props, targets that accept a
tool no part provides, effects on missing props).

### Editing in the Module Studio

Authors no longer need to write any of this as JSON. The scenario editor has:

- **Options and consequences** on every step: turn a step into a decision, tick the right
  option, and say what each wrong action leads to (spark, blown fuse, wrong reading, hazard,
  damage, or a message only).
- **How it runs**: in order or in any order, plus things that look wrong but are fine.
- **Fault cases**: per case, choose the steps it changes and set the reading, the accepted
  range, the right option and why each other option is wrong.
- **Quick check before practising**: multiple-choice questions with explanations.
- **3D scene**: add equipment from the prop library, drag it on a top-down layout, say what each
  part does (an action, a tool to pick up, or a place a tool is used), choose which step's
  reading an instrument shows, and set what changes when a step is done.
- **Try it as a learner**: runs the unsaved draft on the device, with a picker for each fault
  case. Nothing is recorded.

The raw JSON view is still there under "Advanced" for anything the forms do not cover.

Prop library (`frontend/src/components/simulation/sceneProps.tsx`, described for the Studio in
`frontend/src/procedure/propCatalogue.ts`): battery, multimeter, safety glasses, ignition key,
jump leads, earth point, engine with belt, fuse box, fuse tools, spare fuses, distribution board,
lock-off kit, voltage tester, proving unit, wall socket, cable run, spill, extension cable,
extinguisher, fuel can, loose tools, workbench, first-aid box, and a generic labelled block. All
are procedural placeholders until licensed models exist. Adding a kind of equipment means one
component in `sceneProps.tsx` and one entry in `propCatalogue.ts`.

## Practice and assessment

- A practice run (`is_practice`) is scored for the learner, does not count against the attempt
  limit, is excluded from instructor views, pilot analysis, xAPI and competency records, and
  earns no certificate.
- Only one attempt of each kind can be open at a time.

## Ways in

| Route | For | Notes |
|---|---|---|
| `/class/:code` | Learners without email | Instructor shows the class code (Teaching → Class sign-in). The learner chooses a 6-digit PIN; an optional phone number becomes the sign-in name. |
| Sign-in slips | Whole classes | Instructor pastes a class list; printed slips carry a sign-in name and PIN. PINs are shown once and can be reissued. |
| `/register` | Anyone | Joins the platform's open class and can add open-catalogue lessons. Switch off with `OPEDU_OPEN_REGISTRATION=false`. |
| `/demo` | Visitors | Runs entirely in the browser; nothing is recorded. |
| `/register-school` | Schools, garages, hubs | Creates a pending request. A platform administrator approves it in Django Admin, which creates the organisation and emails a one-time administrator invitation. |

PIN accounts lock after 8 wrong tries for an hour (configurable). Staff can reissue a PIN only for
learner-only accounts that were issued a PIN, never for password accounts.

Research tools (pilot governance, surveys) appear only for organisations with
`research_enabled`; existing pilot schools were switched on by migration `0025`.

## Certificates

Certificates claim only what happened: **Practice completed** (self-study), **Simulation passed**
(assigned and auto-scored, with a statement that workshop competence needs an instructor), or
**Instructor confirmed** (after sign-off). The public check link stops verifying if an
instructor later marks the attempt not yet competent.

## Trades

| Trade | Lessons (draft content) |
|---|---|
| Automobile Technology | Battery inspection and diagnosis, jump-starting, replacing a fuse, charging-system voltage |
| Electrical Installation | Safe isolation (prove dead, with a mislabelled-board fault case), continuity testing |
| All trades | Workshop hazard hunt |

## Languages

The interface is available in English, Kinyarwanda (navigation only, as before), French and
Swahili. French and Swahili cover the navigation and the learner journey: signing in, joining a
class, my lessons, the lesson briefing, the practice workspace and results. **They are drafts**
and the interface says so until a native-speaking trainer reviews `frontend/src/i18n/messages.fr.ts`
and `messages.sw.ts`; then remove the locale from `DRAFT_LOCALES` in `messages.ts`. Screens for
instructors, authors and administrators remain in English.

A learner's language choice is saved on their account (`POST /api/v1/auth/preferences/`), so it
follows them to a shared or new device. Lessons can now be written in French (`fr`) or Swahili
(`sw`); lesson text is never machine-translated. The Listen button reads a step in the lesson's
language, using recorded narration when the lesson has it.

## Camera AR

The bench now stands on the printed marker and tilts and turns with it. The four corners the QR
detector reports give a homography, which is split into the marker's rotation and distance
(`frontend/src/ar/markerPose.ts`); a 3D camera matching the phone's then draws the bench in
place, easing between detections. Browsers do not report a camera's focal length, so a typical
phone field of view (66° horizontal) is assumed: a wrong guess changes how far away the bench
looks, not how it sits on the marker. Without corners, or with manual rig alignment, the bench is
drawn flat over the view as before.

## Still to do

- Instructor validation of every demonstration procedure, reading, tolerance and fault case.
- Native-speaker Kinyarwanda for the new interface text and recorded narration
  (`role: "narration"` audio files with `metadata.stepCode` and `metadata.language`); the
  Listen button uses them before falling back to the device's voice.
- Licensed 3D models, and physical-device testing of the new scene on the lowest supported phone.
- Native-speaker review of the French and Swahili catalogues, and translation of the remaining
  learner screens (catalogue, progress, certificates, sync messages).
- Camera AR on real phones: the assumed field of view and the marker size relative to the bench
  should be checked against the printed marker on the lowest supported device.
- Instructor validation of the Electrical Installation procedures against the RTB curriculum.
