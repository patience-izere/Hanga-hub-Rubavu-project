# Courses, access levels and full CRUD: to-do list

Requested on 11 November 2026 after the UI release. `[x]` done · `[ ]` to do · `[~]` needs an action outside the code.

## Editing whatever the status
- [x] Platform and school administrators can edit a lesson in any status (draft, in review, approved, published, retired)
- [x] Editing a published practical opens a new draft version automatically (learners' recorded attempts keep the version they used)

## Course access levels
- [x] Each course has an access level: Public (no account, progress not saved) · Free account (sign in, progress saved) · School members only
- [x] Access level shown wherever a course or lesson appears (Studio, public Courses page, catalogue)
- [x] Public lessons playable without an account (generalised demo; nothing recorded)

## Public "Courses" page
- [x] "Courses" link in the public navigation
- [x] Courses list with access badges and filters (access, trade, level)
- [x] Course detail: description, outcomes, requirements, prerequisites, age group, level, duration, language, delivery, provider, modules and lessons, and what access means for the visitor
- [x] Course form in the Studio captures all of these details

## Full CRUD (create, read, update, delete)
- [x] Organisations (platform): edit, deactivate/reactivate, delete when empty
- [x] Courses: edit all details, delete when no learner evidence (otherwise unpublish)
- [x] Modules: rename, reorder, delete when empty
- [x] Competencies: edit, delete when not yet evidenced
- [x] Lessons: edit in any status (admins), delete when no learner evidence (otherwise retire)
- [x] Classes: rename, archive, delete when empty
- [x] Asset packages: rename, delete draft package, remove a file from a draft
- [x] Assignments: cancel an assignment that has no attempts
- [x] Contact messages: delete
- [x] Registration requests: already approve/decline (no change)

## Public site
- [x] "Home" link in the navigation
- [x] Link preview says what OPedu is in a few words (description, image, type)
- [~] Footer: LinkedIn, X, Facebook, Instagram, YouTube icons under the logo
  - Icons show as "coming soon" until the profile addresses are added in `frontend/src/config/site.ts`.
- [x] Footer: "Talk to us on WhatsApp" (+250 789 405 950), email, telephone
- [x] Footer › Connect: Disclaimer link
- [x] Disclaimer page: not a college, not affiliated, no certificates; partner institutions may certify after virtual and physical training
- [x] Contact page shows the confirmed contact details

## Finish
- [x] Tests (backend, unit, browser), lint, types, build, budgets, OpenAPI schema
- [x] Commit on `feature/courses-and-crud`

## Notes
- Published lessons: administrators edit the wording in place (title, summary, objectives, safety
  notes, time, language, module). The course, address and version number stay fixed, and the
  practical is edited as a new version, so recorded attempts always match what was practised.
- Delete is refused where it would destroy learner evidence; the message offers the safe
  alternative (unpublish, retire, archive, switch off, suspend).
- "Certificate" in the learner pages is now "practice record", with a line saying it is not a
  certificate or qualification, to match the disclaimer.
- `load_lessons` now adds the built-in courses once; later deploys keep edits made in the Studio.
