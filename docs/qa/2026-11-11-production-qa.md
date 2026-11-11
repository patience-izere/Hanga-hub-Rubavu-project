# OPedu pre-launch QA report

**Platform:** https://opedu.izere.work (production, release `0dda98d`)
**Date:** 11 November 2026
**Method:** automated browser testing (Playwright, Chromium) with screenshots, an automated
WCAG 2 A/AA scan (axe-core), and manual review of every screen.

| Where | What was tested |
|---|---|
| Production | Public site and every signed-in page as the platform administrator, signed out, at four screen sizes, in light and dark device settings, on a slowed connection and offline. Nothing was created or changed except one failed sign-in with a made-up account. |
| Local copy of the same code | Everything that creates, edits, deletes, uploads or exports, with the demonstration data plus 10,000 extra learners and very long names, signed in as school administrator, instructor and learner. |

Production holds no lessons or schools yet, so data features could only be exercised on the local
copy. Two local server errors came from the local SQLite test database (it accepts one write at a
time) and are not counted as defects; production uses PostgreSQL.

## Launch readiness

**8 of 23 checklist items pass.** Production is not ready for learners until the blockers below
are fixed: today a learner who signs up finds no lessons, and nobody receives an email.

| Area | Item | Result |
|---|---|---|
| Navigation | All navigation links work | ✅ Pass: 16 public links and 18 sidebar links open the right page |
| Navigation | Sidebar and dropdowns work | ⚠️ Partial: sidebar works; no mobile menu on the public site (N-3) |
| Navigation | Breadcrumbs and browser navigation | ⚠️ Partial: back/forward work; no breadcrumbs; scroll position not reset (N-1) |
| Authentication | Login and logout | ✅ Pass |
| Authentication | Password reset | ❌ Fail: no email is sent in production (A-1) |
| Authentication | Role permissions enforced | ✅ Pass: pages and API refuse other roles and signed-out visitors |
| Forms | Validation | ✅ Pass: required fields, email format, past due dates |
| Forms | Create and update | ⚠️ Partial: works, but no success message on some forms (F-2) |
| Forms | File uploads | ❌ Fail: no way to start a new asset package, so uploads cannot be reached (F-4) |
| Forms | Duplicate submissions prevented | ❌ Fail: double-click sends two create requests (F-1) |
| Data | Search, sorting and filtering | ✅ Pass |
| Data | Pagination | ❌ Fail: lists render every row; 10,000 people took 12 s (D-1) |
| Data | Delete and export | ⚠️ Partial: confirmation and CSV work; no Excel/PDF; stale message after revoke (D-3, D-4) |
| Data | Empty and loading states | ⚠️ Partial: present, but empty states rarely say what to do next (D-5) |
| UI/UX | Responsive layouts | ⚠️ Partial: no overflow at 4 sizes; small touch targets and oversized headings on phones |
| UI/UX | Consistent styling | ❌ Fail: oversized headings, mostly-green "light" theme, no theme choice (U-1, U-2) |
| UI/UX | No overlapping or clipped elements | ✅ Pass: long names and long class names stay inside their boxes |
| UI/UX | All interactive controls work | ⚠️ Partial: invisible links on sign-in; dialogs ignore the keyboard (U-4, X-2) |
| Quality | No console errors | ❌ Fail: 401 on every page, 403 on Pilot governance (Q-1, Q-2) |
| Quality | No failed API requests | ❌ Fail: same as above |
| Quality | Accessibility checks pass | ❌ Fail: contrast failures on public forms; dialogs do not manage focus (X-1, X-2) |
| Quality | Performance acceptable | ⚠️ Partial: about 1 s server response; very slow with large lists |
| Quality | Regression tests pass | ✅ Pass: 150 backend, 94 unit and 21 browser tests pass on this release |

## Findings

Severity: **Blocker** stops people completing core work · **High** breaks a feature or misleads ·
**Medium** hurts usability or quality · **Low** polish.

### Blockers

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| B-1 | Production has no content. The lesson catalogue is empty, the Module Studio has 0 practicals, and "Try a lesson now" shows "The demonstration is not available". | `/api/v1/catalogue/` returns no lessons; `/api/v1/demo/` returns 404. | Add a production command that loads the lessons (automotive, electrical installation, hazard hunt) and a real school, without the demo accounts and their known password. Run it once on the server. |
| B-2 | No school exists, and the administrator account belongs to none, so school pages show zeros and classes, courses and invitations have nothing to attach to. The app cannot create a school; only Django admin can. | School overview shows 0/0; sidebar shows "Open class". | Let a platform administrator create schools and approve registration requests in the app; link the administrator account to the first school. |
| A-1 | No email is sent in production. Invitations and password resets are written only to the server log, yet the screen says "Invitation emailed to …" and "reset instructions were sent". | `/opt/opedu/.env` has an empty `DJANGO_EMAIL_HOST`. | Configure an SMTP or email-API provider. Until then, say "Email is not set up: share this link yourself" instead of claiming it was emailed, and show administrators a warning. |

### Navigation

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| N-1 | Links keep the previous scroll position, so you land at the bottom of the next page. Affects footer and header menus. | Contact from the bottom of About lands 1,407 px down a 2,307 px page. | Scroll to the top on every page change; keep the position on Back/Forward; keep `#section` links working. |
| N-2 | The public menu does not show which page you are on. | No highlighted or `aria-current` link on Features. | Highlight the current page and mark it `aria-current="page"`. |
| N-3 | On phones the public menu disappears and nothing replaces it. | At 390 px only the logo, Sign in and the language picker remain. | Add a menu button that opens the links, like the signed-in area. |
| N-4 | Mistyped addresses silently go to the home page. | `/this-page-does-not-exist` → `/`. | Add a "Page not found" page with links to Home, Sign in and Support. |
| N-5 | No breadcrumbs on nested pages, such as a learner's detail, an attempt review, or a lesson inside the Studio. | Only a "← Back" link on some pages. | Add breadcrumbs on nested workspace pages (e.g. Teaching › Learners › Aline Uwase). |
| N-6 | The administrator sidebar has 18 links in five groups, two called "Overview", and runs past the bottom of the screen. It cannot be collapsed on desktop. | Screenshot `ws_school`. | Rename to "Teaching overview" and "School overview"; let groups collapse; show only the groups relevant to the person's roles. |

### Authentication and accounts

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| A-2 | An expired session sends the person to sign in without saying why. | After the session cookie was removed, `/teach` → `/login` with no message. | Show "Your session expired. Sign in again to continue." The message exists but is not triggered on page loads. |
| A-3 | No password show/hide button on any password field. | Sign-in, register, reset, change password, class PIN. | Add a show/hide button to every password and PIN field. |
| A-4 | People cannot edit their name, email or phone. The account area only changes the password. | "Security" is the only account page. | Add a profile page (name, email, phone, language). Ask for a name when an account has none. |
| A-5 | The administrator has no name, and their sign-in name differs from their email, so the app greets them by sign-in name and wraps it mid-word in the sidebar. | Screenshots `ws_learn`, `ws_school`. | Covered by A-4; truncate long emails with "…" in the sidebar. |
| A-6 | A password-reset link that is invalid shows the form; the error appears only after typing a new password. | `/reset-password/xx/bad-token`. | Check the link when the page opens and say at once if it has expired. |

### Forms

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| F-1 | Double-clicking a submit button sends the request twice. On production this would create the record twice. | "Create class" double-click: 2 POST requests. | Disable the button and show "Saving…" while a request is in flight; give create requests an idempotency key; make the server reject duplicate class names in a school. |
| F-2 | No success message after creating a class. | No confirmation text after the class appears. | Show a short confirmation ("Class created") and move focus to the new class. |
| F-3 | Some rules show only as the browser's tooltip, e.g. the 8-character password minimum on Register. | Message appears only on submit. | Show rules under the field and check them as the person types. |
| F-4 | File upload cannot be reached: the asset page only lists published packages and has no "New package" action. | Screenshot `local-assets`. | Add "New asset package" (draft) with drag-and-drop upload, showing allowed types and the 25 MB limit up front. |
| F-5 | The Contact form opens the visitor's email app with no recipient; the page shows no email, phone or WhatsApp. | `mailto:?subject=…` | Send the message through the API to a real inbox and confirm on screen; show contact details as alternatives. |
| F-6 | The Assign a lesson form is fully shown even when nothing can be assigned. | "No published scenario is available yet" above an editable form. | When there are no published lessons or no learners, replace the form with one message and a button to the fix. |

### Data, tables and dashboards

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| D-1 | Lists load and draw every record at once. | 10,000 members: People page 12 s, all 10,000 drawn; Learners page 3.4 s, 10,002 rows, 170 MB of memory. | Paginate on the server (e.g. 50 per page) with search, filter and sort done by the API; show "1–50 of 10,002". |
| D-2 | The audit log has one filter and no way to load older events in the interface, although the API supports it. | No "Load older" button. | Add "Load older events" and a date-range filter. |
| D-3 | After revoking an invitation, the "Invitation emailed to … / Copy link" message stays on screen next to the now-revoked invitation. | Screenshot `local-invitations`. | Clear the message when the invitation it refers to is revoked. |
| D-4 | Export is CSV only, and only on Operations. No export on the learner list, people or audit log; no Excel or PDF. | One CSV link. | Add CSV/Excel export to the learner list, people and audit log; PDF for a learner's record and certificates. |
| D-5 | Empty states rarely say what to do next ("No open lessons yet. Check back soon."). | Catalogue, Studio, school overview. | Give each role the next step: administrators "Publish a lesson", learners "Join a class with a code". |
| D-6 | Dashboards have no charts and no date-range filter. | 0 chart elements; numbers matched the API. | Add a completion-over-time chart and a date filter (this week, this term, custom) to the Teaching overview. |

### Visual design and consistency

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| U-1 | Headings are far too large. | Page titles 72–101 px, section titles 70 px, workspace titles 58 px; 51–54 px on phones. | Page titles 40–56 px (32–36 px on phones), workspace titles about 32 px, section titles 32–40 px; loosen the tight letter-spacing. |
| U-2 | There is no real light theme and no way to choose. The site follows the device; its "light" version is still dominated by dark-green blocks (hero band, evidence section, call to action, footer, sign-in page). | Screenshots `pub-light_`, `pub-light_login`. | Keep the current look as the dark theme; add a light theme (white and pale surfaces, green only for actions and accents); add a System / Light / Dark switch, remembered per person. |
| U-3 | Dark mode leaves the About page's diagonal panel pale, so its intro and link are pale on pale. | Screenshot `pub-dark_about`. | Give the panel a dark-theme colour and check every page in both themes. |
| U-4 | Three links on the sign-in page are invisible: dark green on dark green. | Screenshot `pub-light_login`; contrast failures also on Register and Register school. | Use a light colour on the dark panel, or move them under the form as clear buttons. |
| U-5 | "Rubavu" appears on every page (footer, About, Contact). | "from Rubavu, Rwanda"; "Rubavu, Western Province, Rwanda". | Change to Kigali; rename the demo school; remove the Rubavu wording from the code. |
| U-6 | The header shows "Open class" under the logo for visitors and for the administrator. | Every page. | Show the school name only when there is one. |
| U-7 | The language picker shows codes only (EN, RW, FR, SW). | Header. | Show names: English, Kinyarwanda, Français, Kiswahili. |
| U-8 | On phones, the sign-in form starts two screens down. | Screenshot `mobile_login`. | Put the form first on small screens and shorten the intro. |
| U-9 | Some touch targets on phones are under 32 px. | 1 on School overview, 1 on Teaching overview; 6 px sideways overflow on Teaching overview at 390 px. | Minimum 44 × 44 px tap areas; fix the overflowing element. |
| U-10 | Pilot governance shows internal jargon ("Batch 11 evidence governance") and a bare drop-down. Survey is a dead end ("disabled until the institution approves this consent policy"). | Screenshots. | Plain-language explanations; hide Pilot governance and Survey unless a school runs an approved study. |
| U-11 | No preview image when links are shared on WhatsApp or social media. | No `og:image`. | Add a share image and title. |

### Accessibility

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| X-1 | Colour-contrast failures on public forms. | axe: 3 on Sign in, 1 on Register, 3 on Register school. | Fix with U-4; re-run the scan in both themes. |
| X-2 | Dialogs and confirmations do not manage keyboard focus: focus does not move into them, Escape does not close them, and focus is not returned afterwards. Includes the full-screen Studio preview. | No `focus()` or Escape handling in the code; 3 confirmation dialogs. | Use a dialog component that moves focus in, traps it, closes on Escape and returns focus. |
| X-3 | Signed-in pages pass the automated scan, have visible focus outlines and a working "Skip to main content" link. | axe: 0 violations on 19 workspace pages. | Keep; add the scan to CI so it stays that way. |

### Quality and performance

| ID | Issue | Evidence | Suggested fix |
|---|---|---|---|
| Q-1 | Every page logs a 401 error while checking whether someone is signed in. | Browser console on all public pages. | Return "not signed in" without an error status, so real errors stand out. |
| Q-2 | Pilot governance fails to load its options for the platform administrator (403). | `GET /api/v1/research/pilots/options/` → 403. | Allow platform administrators, or hide the page when they cannot use it (U-10). |
| Q-3 | Offline, pages show "Loading members…" forever instead of saying the device is offline. | Screenshot `offline`. | Detect the offline state and show "You're offline. This page needs a connection." with a retry; keep saved lessons usable offline. |
| Q-4 | A server error (500) leaves "Loading…" on screen for several seconds while the app retries silently. | Learners page with a simulated 500. | Show "Still trying…" after a moment, then the error with a retry button. |
| Q-5 | About 0.9 s before the server sends the first byte, even for the tiny home page. | `curl`: time to first byte 0.90 s. | Check the proxy and nginx configuration; cache the home page. |

## What works well

- All links, the logo, sidebar, active highlighting, browser back/forward and refreshing nested pages.
- Signing in and out, wrong-password and bad-class-code messages, returning to the requested page
  after signing in, neutral password-reset replies.
- Permissions: signed-out visitors, learners and instructors are refused pages and API calls they
  should not have (403 or redirect).
- Form validation: required fields, email format, due dates in the past, role and lesson drop-downs.
- Search on people and learners is accurate; empty search results say so.
- Revoking an invitation asks for confirmation and marks it revoked.
- CSV export downloads with the right columns.
- A learner can complete a whole practice run and see the result, the replay and their score.
- Long names stay inside their boxes; no page scrolls sideways on desktop, laptop or tablet.
- HTTPS, security headers, compression and long-term caching are correct.
- One API request per page load; loading indicators appear on slow connections.

## Recommended order of work

1. **Make the platform usable:** B-1, B-2, A-1.
2. **Your reported issues:** N-1 (scroll), U-1 (heading sizes), U-2 and U-3 (light and dark themes
   with a switch), U-5 (Kigali).
3. **Broken or misleading:** F-1, F-4, F-5, D-1, D-3, U-4, Q-2, Q-3, A-2, N-3, X-2.
4. **Usability:** N-2, N-4, N-5, N-6, A-3, A-4, A-6, F-2, F-3, F-6, D-2, D-5, U-6, U-8, U-9, U-10,
   Q-4.
5. **Polish and reporting:** D-4, D-6, U-7, U-11, Q-1, Q-5.

After each group, re-run the automated browser checks (regression) and this checklist. Turning the
scripts used for this report into Playwright tests in `frontend/e2e/` would make that automatic on
every pull request.
