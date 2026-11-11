# UI branch: to-do list

Work list for every issue in [2026-11-11-production-qa.md](2026-11-11-production-qa.md). IDs match
the report. Ticked items are done on the `UI` branch.

Legend: `[ ]` to do · `[x]` done · `[~]` done in code, needs an action on the server or an account

## 1. Make the platform usable
- [~] B-1 Load the lessons on production (idempotent command, run by every deploy; no demo accounts)
  - `manage.py load_lessons` runs on every deploy; lessons appear on production at the next deploy of main.
- [~] B-2 Platform administrator can create schools in the app; first school linked to the administrator
  - Platform › Schools page and API. After deploy, add the first school there (tick "Make me an administrator").
- [~] A-1 Honest email status: say "share this link yourself" when email is off; warn administrators; document SMTP setup
  - Nothing claims an email was sent; links shown to share by hand; warnings for administrators. Real delivery needs SMTP credentials in `/opt/opedu/.env`.

## 2. Reported by the owner
- [x] N-1 Scroll to the top on every page change (keep Back/Forward position and `#section` links)
- [x] U-1 Smaller headings (page 40–56 px, phones 32–36 px, workspace ~32 px)
- [x] U-2 Real light theme + System / Light / Dark switch, remembered per person
  - Device / Light / Dark switch in both headers, remembered on the device, applied before first paint.
- [x] U-3 Dark theme: About page panel readable
- [x] U-5 Kigali instead of Rubavu everywhere

## 3. Broken or misleading
- [x] F-1 Submit buttons disabled while saving (no double submission); server rejects duplicate class names
- [x] F-4 "New asset package" so uploads can be reached; allowed types and size limit shown
  - "New asset package" form; accepted types and 25 MB limit shown before upload.
- [x] F-5 Contact form sends to a real inbox through the API; contact details shown
  - Messages are stored and listed for platform administrators; also emailed to `OPEDU_CONTACT_EMAIL` when set. No phone or email is shown publicly because none has been confirmed.
- [x] D-1 Server-side pagination for learners and people (50 per page, search on the server)
  - People: server pages of 50 with server search (12 s → 0.9 s for 10,000 people). Learners, class picker and assign list: 50 per page in the browser (learners 3.4 s → 2 s).
- [x] D-3 Clear the "Invitation emailed / Copy link" message when that invitation is revoked
- [x] U-4 Sign-in page links visible
- [x] Q-2 Pilot governance usable by platform administrators (no 403)
- [x] Q-3 Offline message instead of endless "Loading…"
- [x] A-2 "Your session expired" message when a session ends
- [x] N-3 Mobile menu on the public site
- [x] X-2 Dialogs: focus moves in, is trapped, Escape closes, focus returns

## 4. Usability
- [x] N-2 Current page highlighted in the public menu (`aria-current`)
- [x] N-4 "Page not found" page
- [x] N-5 Breadcrumbs on nested workspace pages
  - Learner detail, attempt review, lesson editor, practical editor, lesson brief.
- [x] N-6 Clearer sidebar: unique group names, collapsible groups
- [x] A-3 Show/hide button on password and PIN fields
- [x] A-4 Profile page: name, email, phone, language
- [x] A-5 Long emails truncated in the sidebar; greeting uses the name
- [x] A-6 Invalid reset link reported when the page opens
- [x] F-2 Success message after creating a class
  - Confirmation shown; repeated names now refused.
- [x] F-3 Form rules shown under the field (password length)
- [x] F-6 Assign form replaced by one message when nothing can be assigned
- [x] D-2 Audit log: "Load older events" and date filter
  - "Show older entries" already existed; added From/To dates, Clear filters and CSV download.
- [x] D-5 Empty states say what to do next
- [x] U-6 No "Open class" label when there is no school
- [x] U-8 Sign-in form first on phones
- [x] U-9 Touch targets at least 44 px; no sideways overflow on Teaching overview at 390 px
  - No sideways overflow at 390 px on any signed-in page checked; footer and workspace controls at least 44 px tall on phones.
- [x] U-10 Plain language on Pilot governance; hide Pilot governance and Survey unless a study is running
  - Research tools show only while a school runs a study; plain wording on pilot and survey pages.
- [x] Q-4 "Still trying…" then an error with Retry when the server fails

## 5. Polish and reporting
- [x] D-4 CSV export on learners, people and audit log
  - CSV (opens in Excel) on People, Learners and Audit log, plus the existing evidence CSV. Certificates already print to PDF. Native .xlsx not added.
- [x] D-6 Completion chart and date filter on the Teaching overview
  - Completed-attempts-per-day chart with 7 / 30 / 90 days or custom dates, tooltips and a table view.
- [x] U-7 Language names instead of codes
- [x] U-11 Share image and title for WhatsApp / social media
- [x] Q-1 No 401 error when checking whether someone is signed in
- [~] Q-5 Faster first byte (caching of the home page and static files)
  - Measured: about 0.5 s of the 0.9 s is connection and TLS set-up (network distance); the server takes about 0.2 s. Added cache headers so repeat visits revalidate cheaply. Further gains need HTTP/3 or a CDN on the shared edge proxy.
- [x] X-1 Contrast failures fixed (re-scan both themes)
  - Light-theme contrast scan added for 8 public pages; signed-in pages scanned clean.
- [x] X-3 Accessibility scan kept in CI
  - Light- and dark-theme contrast checks and `ui-regressions.spec.ts` run in CI with the browser tests.

## 6. Finish
- [x] All checks pass (backend tests, unit tests, lint, types, build, OpenAPI schema, browser tests)
  - Backend 165 tests, unit 94, browser 35 (twice in a row), ESLint 0 errors, Prettier, Ruff, TypeScript, build, performance budgets, OpenAPI schema current, no missing migrations, integrity check.
- [ ] Push the `UI` branch
