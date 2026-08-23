import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "react-router-dom";

import type { User } from "../api/client";
import { authQueryKey, useSignOut } from "../auth/useAuth";
import { roleCapabilities } from "../auth/useRoles";
import { InstallAppButton } from "./InstallAppButton";
import { useLocale } from "../i18n/LocaleProvider";

type AppShellProps = {
  user: User | null;
};

/**
 * The public marketing shell. Signed-in users get `WorkspaceShell` instead, so this navigation
 * carries only public links plus a way back into the workspace.
 */
export function AppShell({ user }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useSignOut();
  const { locale, setLocale, t } = useLocale();
  const roles = roleCapabilities(user);
  const workspaceLabel = roles.canReviewEvidence ? t("instructor") : t("learning");

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login", { replace: true, flushSync: true });
    queryClient.setQueryData(authQueryKey, null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="OPedu home">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>OPedu</strong>
            <small>Open class</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link className="public-nav-link" to="/about">
            {t("about")}
          </Link>
          <Link className="public-nav-link" to="/features">
            {t("features")}
          </Link>
          <Link className="public-nav-link nav-secondary" to="/updates">
            {t("updates")}
          </Link>
          <Link className="public-nav-link nav-secondary" to="/contact">
            {t("contact")}
          </Link>
          <Link className="public-nav-link nav-secondary" to="/support">
            Support
          </Link>
          {user ? (
            <Link className="nav-cta" to={roles.homePath}>
              {workspaceLabel}
            </Link>
          ) : null}
          <InstallAppButton />
          {user ? (
            <button className="button-link" onClick={handleLogout} disabled={logout.isPending}>
              {logout.isPending ? "Signing out…" : t("signOut")}
            </button>
          ) : (
            <Link className="nav-cta" to="/login">
              {t("signIn")}
            </Link>
          )}
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
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <div>
            <strong>OPedu</strong>
            <p>Practical skills, safely learned.</p>
          </div>
        </div>
        <div className="footer-links">
          <div>
            <strong>Explore</strong>
            <Link to="/about">About OPedu</Link>
            <Link to="/features">Platform features</Link>
            <Link to="/updates">Updates</Link>
          </div>
          <div>
            <strong>Access</strong>
            <Link to="/onboarding">School onboarding</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/support">Support centre</Link>
          </div>
          <div>
            <strong>Connect</strong>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>Competency-based technical learning from Rubavu, Rwanda.</p>
          <p>Digital guidance never replaces qualified workshop supervision.</p>
        </div>
      </footer>
    </div>
  );
}
