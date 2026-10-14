import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { describeApiError, forgetCachedUser, isNetworkError, type User } from "../../api/client";
import { clearLocalLearningData, listOutboxItems } from "../../offline/outbox";
import { authQueryKey, useSignOut } from "../../auth/useAuth";
import { roleCapabilities } from "../../auth/useRoles";
import { useLocale } from "../../i18n/LocaleProvider";
import type { Locale } from "../../i18n/messages";
import { InstallAppButton } from "../InstallAppButton";
import { workspaceSections } from "./workspaceNav";

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Platform administrator",
  admin: "School administrator",
  instructor: "Instructor",
  content_author: "Content author",
  learner: "Learner",
};

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
  const { locale, setLocale, t, coverage } = useLocale();
  const roles = roleCapabilities(user);
  const sections = workspaceSections(roles);
  const displayName = user.firstName || user.email;
  const primaryRole = ROLE_LABELS[user.roles[0]] ?? "Member";

  const [menuOpen, setMenuOpen] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState<number | null>(null);
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
            <small>{user.organization || "Open class"}</small>
          </span>
        </Link>
        <div className="workspace-header-actions">
          <InstallAppButton />
          <label className="locale-select">
            <span className="sr-only">{t("language")}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="en">EN</option>
              <option value="rw">RW</option>
            </select>
          </label>
          {locale !== "en" && coverage < 1 ? (
            // Say plainly which parts are translated rather than leaving a learner to discover
            // that most of the interface is still English.
            <span className="locale-coverage" role="status">
              Navigation translated; lesson content stays in its authored language.
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
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      {unsyncedCount !== null ? (
        <div className="workspace-alert" role="alertdialog" aria-labelledby="unsynced-title">
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
              <strong>{displayName}</strong>
              <small>{primaryRole}</small>
            </div>
          </div>
          {sections.map((section) => (
            <div className="workspace-nav-section" key={section.heading}>
              <h2>{t(section.heading)}</h2>
              <ul>
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
          ))}
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
