import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import type { User } from "../api/client";
import { authQueryKey, useSignOut } from "../auth/useAuth";

type AppShellProps = {
  children: ReactNode;
  user: User | null;
};

export function AppShell({ children, user }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useSignOut();
  const dashboardLabel = user?.roles.some(
    (role) => role === "platform_admin" || role === "instructor" || role === "admin",
  )
    ? "Instructor dashboard"
    : "My learning";

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login", { replace: true, flushSync: true });
    queryClient.setQueryData(authQueryKey, null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="OPedu home">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>OPedu</strong>
            <small>Technical learning</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link className="public-nav-link" to="/about">
            About
          </Link>
          <Link className="public-nav-link" to="/features">
            Features
          </Link>
          <Link className="public-nav-link nav-secondary" to="/updates">
            Updates
          </Link>
          <Link className="public-nav-link nav-secondary" to="/contact">
            Contact
          </Link>
          {user ? <Link to="/dashboard">{dashboardLabel}</Link> : null}
          {user ? <Link to="/account/security">Security</Link> : null}
          {user ? (
            <button className="button-link" onClick={handleLogout} disabled={logout.isPending}>
              {logout.isPending ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link className="nav-cta" to="/login">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main id="main-content">{children}</main>
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
