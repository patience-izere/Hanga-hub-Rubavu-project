import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { User } from "../api/client";
import { authQueryKey, useSignOut } from "../auth/useAuth";
import { roleCapabilities } from "../auth/useRoles";
import { OfflineBanner } from "./OfflineBanner";
import { InstallAppButton } from "./InstallAppButton";
import { useLocale } from "../i18n/LocaleProvider";
import { LanguageSelect, ThemeSelect } from "./ShellControls";
import { BrandLogo } from "./BrandLogo";
import { SocialGlyph, SocialLinks } from "./SocialIcons";
import { CONTACT } from "../config/site";

const PUBLIC_LINKS = [
  { to: "/", label: "home", end: true },
  { to: "/courses", label: "courses" },
  { to: "/about", label: "about" },
  { to: "/features", label: "features" },
  { to: "/updates", label: "updates" },
  { to: "/contact", label: "contact" },
  { to: "/support", label: "support" },
] as const;

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
  const location = useLocation();
  const { t } = useLocale();
  const roles = roleCapabilities(user);
  const workspaceLabel = roles.canReviewEvidence ? t("instructor") : t("learning");
  const [menuOpen, setMenuOpen] = useState(false);

  // Following a link closes the phone menu.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login", { replace: true, flushSync: true });
    queryClient.setQueryData(authQueryKey, null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("shell.skipToContent")}
      </a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="OPedu home">
          <BrandLogo height={52} />
          {user?.organization ? (
            <span>
              <small>{user.organization}</small>
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className="public-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="public-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? t("shell.closeMenu") : t("shell.menu")}
        </button>
        <nav
          id="public-nav"
          className={menuOpen ? "public-nav is-open" : "public-nav"}
          aria-label="Primary navigation"
        >
          {PUBLIC_LINKS.map((link) => (
            <NavLink
              key={link.to}
              className="public-nav-link"
              to={link.to}
              end={"end" in link ? link.end : undefined}
            >
              {t(link.label)}
            </NavLink>
          ))}
          {user ? (
            <Link className="nav-cta" to={roles.homePath}>
              {workspaceLabel}
            </Link>
          ) : null}
          <InstallAppButton />
          {user ? (
            <button className="button-link" onClick={handleLogout} disabled={logout.isPending}>
              {logout.isPending ? t("shell.signingOut") : t("signOut")}
            </button>
          ) : (
            <NavLink className="nav-cta" to="/login">
              {t("signIn")}
            </NavLink>
          )}
          <div className="shell-preferences">
            <LanguageSelect />
            <ThemeSelect />
          </div>
        </nav>
      </header>
      <OfflineBanner />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <div>
            <BrandLogo height={56} />
            <p>Practical skills, safely learned.</p>
            <SocialLinks />
            <a
              className="footer-whatsapp"
              href={CONTACT.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SocialGlyph network="whatsapp" />
              Talk to us on WhatsApp
            </a>
            <address className="footer-contact">
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              <a href={CONTACT.phoneHref}>Tel. {CONTACT.phoneDisplay}</a>
              <span>{CONTACT.address}</span>
            </address>
          </div>
        </div>
        <div className="footer-links">
          <div>
            <strong>Explore</strong>
            <Link to="/courses">Courses</Link>
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
            <Link to="/disclaimer">Disclaimer</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>Competency-based technical learning from Kigali, Rwanda.</p>
          <p>Digital guidance never replaces qualified workshop supervision.</p>
        </div>
      </footer>
    </div>
  );
}
