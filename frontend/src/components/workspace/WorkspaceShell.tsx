import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import type { User } from "../../api/client";
import { authQueryKey, useSignOut } from "../../auth/useAuth";
import { roleCapabilities } from "../../auth/useRoles";
import { useLocale } from "../../i18n/LocaleProvider";
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
  const queryClient = useQueryClient();
  const logout = useSignOut();
  const { locale, setLocale, t } = useLocale();
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
        Skip to main content
      </a>
      <header className="workspace-header">
        <Link className="brand" to={roles.homePath} aria-label="OPedu workspace home">
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
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as "en" | "rw")}
            >
              <option value="en">EN</option>
              <option value="rw">RW</option>
            </select>
          </label>
          <button className="button-link" onClick={handleLogout} disabled={logout.isPending}>
            {logout.isPending ? "Signing out…" : t("signOut")}
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <nav className="workspace-nav" aria-label="Workspace navigation">
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
              <h2>{section.heading}</h2>
              <ul>
                {section.links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) => (isActive ? "is-active" : undefined)}
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Link className="workspace-nav-exit" to="/">
            Public site
          </Link>
        </nav>

        <main id="main-content" className="workspace-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
