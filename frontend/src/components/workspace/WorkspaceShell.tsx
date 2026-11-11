import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  describeApiError,
  forgetCachedUser,
  isNetworkError,
  savePreferredLanguage,
  type User,
} from "../../api/client";
import { clearLocalLearningData, listOutboxItems } from "../../offline/outbox";
import { authQueryKey, useSignOut } from "../../auth/useAuth";
import { roleCapabilities } from "../../auth/useRoles";
import { useLocale } from "../../i18n/LocaleProvider";
import { OfflineBanner } from "../OfflineBanner";
import { useDialogFocus } from "../ui/Dialog";
import { InstallAppButton } from "../InstallAppButton";
import { LanguageSelect, ThemeSelect } from "../ShellControls";
import { workspaceSections, type WorkspaceSection } from "./workspaceNav";
import "../../styles/workspace-shell.css";

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Platform administrator",
  admin: "School administrator",
  instructor: "Instructor",
  content_author: "Content author",
  learner: "Learner",
};

const COLLAPSED_KEY = "opedu:collapsed-nav";

function readCollapsedSections(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(stored) ? stored.map(String) : []);
  } catch {
    return new Set();
  }
}

/**
 * The signed-in shell.
 *
 * Kept separate from `AppShell`, which serves the public marketing site. Mixing the two put five
 * marketing links ahead of the user's actual work in a single flat navigation bar.
 */
export function WorkspaceShell({ user }: { user: User }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const logout = useSignOut();
  const { locale, t, coverage, draft } = useLocale();
  const roles = roleCapabilities(user);
  const sections = workspaceSections(roles);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const displayName = fullName || user.email || user.username;
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsedSections);

  function sectionIsCurrent(section: WorkspaceSection) {
    return section.links.some(
      (link) =>
        location.pathname === link.to ||
        (!link.end && location.pathname.startsWith(`${link.to}/`)) ||
        (link.alsoActiveFor ?? []).some((prefix) => location.pathname.startsWith(prefix)),
    );
  }

  function toggleSection(heading: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Remembered for this page only.
      }
      return next;
    });
  }
  const primaryRole = ROLE_LABELS[user.roles[0]] ?? "Member";

  const [menuOpen, setMenuOpen] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState<number | null>(null);
  const unsyncedDialog = useRef<HTMLDivElement>(null);
  useDialogFocus(unsyncedDialog, () => setUnsyncedCount(null), {
    trap: false,
    active: unsyncedCount !== null,
  });
  const [signOutError, setSignOutError] = useState("");

  // A link in the phone menu should take you there and get the menu out of the way.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function requestLogout() {
    setSignOutError("");
    const pending = (await listOutboxItems().catch(() => [])).length;
    if (pending > 0) {
      setUnsyncedCount(pending);
      return;
    }
    await finishLogout();
  }

  async function finishLogout() {
    try {
      await logout.mutateAsync();
    } catch (error) {
      // The session cookie can only be ended by the server, so do not pretend it was.
      setSignOutError(
        isNetworkError(error)
          ? "You're offline, so you can't sign out yet. Reconnect, then sign out, so the next person cannot use your account."
          : describeApiError(error, "Sign out failed. Try again."),
      );
      return;
    }
    // Shared workshop computers: nothing from this person may be shown to the next one.
    await clearLocalLearningData().catch(() => undefined);
    forgetCachedUser();
    setUnsyncedCount(null);
    // One batched render: nobody is signed in, their data is gone, and the page is /login.
    // Navigating first would let /login see the old user and send them back. The auth query is
    // updated rather than cleared so the app's subscription to it sees the sign-out.
    queryClient.setQueryData(authQueryKey, null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== authQueryKey[0] });
    queryClient.getMutationCache().clear();
    navigate("/login", { replace: true });
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        {t("shell.skipToContent")}
      </a>
      <header className="workspace-header">
        <Link className="brand" to={roles.homePath} aria-label={t("shell.workspaceHome")}>
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>OPedu</strong>
            {user.organization ? <small>{user.organization}</small> : null}
          </span>
        </Link>
        <div className="workspace-header-actions">
          <InstallAppButton />
          <LanguageSelect
            onChange={(next) => {
              // Kept on the account too, so it follows the learner to a shared or new device.
              void savePreferredLanguage(next)
                .then((saved) => queryClient.setQueryData(authQueryKey, saved))
                .catch(() => undefined);
            }}
          />
          <ThemeSelect />
          {locale !== "en" ? (
            // Say plainly what is translated, rather than leaving a learner to discover it.
            <span className="locale-coverage" role="status">
              {coverage < 1 ? "Navigation translated. " : ""}
              {t("shell.lessonLanguageNote")}
              {draft ? ` ${t("shell.draftTranslation")}` : ""}
            </span>
          ) : null}
          <button
            className="button-link workspace-signout"
            onClick={() => void requestLogout()}
            disabled={logout.isPending}
          >
            {logout.isPending ? t("shell.signingOut") : t("signOut")}
          </button>
          <button
            type="button"
            className="workspace-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="workspace-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? t("shell.closeMenu") : t("shell.menu")}
          </button>
        </div>
      </header>

      <OfflineBanner />
      {unsyncedCount !== null ? (
        <div
          ref={unsyncedDialog}
          className="workspace-alert"
          role="alertdialog"
          aria-labelledby="unsynced-title"
        >
          <p id="unsynced-title">
            <strong>
              {unsyncedCount === 1
                ? "1 practice action on this device has not reached the server yet."
                : `${unsyncedCount} practice actions on this device have not reached the server yet.`}
            </strong>{" "}
            Signing out deletes them. Reconnect and wait for them to sync, or sign out anyway.
          </p>
          <div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setUnsyncedCount(null)}
            >
              Stay signed in
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={logout.isPending}
              onClick={() => void finishLogout()}
            >
              Sign out and delete them
            </button>
          </div>
        </div>
      ) : null}
      {signOutError ? (
        <p className="workspace-alert form-error" role="alert">
          {signOutError}
        </p>
      ) : null}

      <div className="workspace-body">
        <nav
          id="workspace-nav"
          className={menuOpen ? "workspace-nav is-open" : "workspace-nav"}
          aria-label={t("shell.workspaceNav")}
        >
          <div className="workspace-identity">
            <span className="profile-initial" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong title={displayName}>{displayName}</strong>
              <small>{primaryRole}</small>
            </div>
          </div>
          {sections.map((section) => {
            const sectionId = `nav-section-${section.heading.replace(/\W+/g, "-")}`;
            // The section holding the current page always stays open.
            const open = sectionIsCurrent(section) || !collapsed.has(section.heading);
            return (
              <div className="workspace-nav-section" key={section.heading}>
                <h2>
                  <button
                    type="button"
                    className="workspace-nav-heading"
                    aria-expanded={open}
                    aria-controls={sectionId}
                    onClick={() => toggleSection(section.heading)}
                  >
                    {t(section.heading)}
                    <span aria-hidden="true">{open ? "−" : "+"}</span>
                  </button>
                </h2>
                <ul id={sectionId} hidden={!open}>
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        end={link.end}
                        className={({ isActive }) =>
                          isActive ||
                          (link.alsoActiveFor ?? []).some((prefix) =>
                            location.pathname.startsWith(prefix),
                          )
                            ? "is-active"
                            : undefined
                        }
                      >
                        {t(link.label)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <Link className="workspace-nav-exit" to="/">
            {t("nav.publicSite")}
          </Link>
        </nav>

        <main id="main-content" className="workspace-main" tabIndex={-1}>
          <Suspense fallback={<p className="panel-status">{t("state.loading")}</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
