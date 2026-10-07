import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../../api/client";
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

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login", { replace: true, flushSync: true });
    queryClient.setQueryData(authQueryKey, null);
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
          <button className="button-link" onClick={handleLogout} disabled={logout.isPending}>
            {logout.isPending ? t("shell.signingOut") : t("signOut")}
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <nav className="workspace-nav" aria-label={t("shell.workspaceNav")}>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
