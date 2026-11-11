import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import type { User } from "../api/client";
import { roleCapabilities } from "../auth/useRoles";

/** Shown for any address the app does not know, instead of silently going to the home page. */
export function NotFoundPage({ user }: { user: User | null }) {
  const { pathname } = useLocation();
  const roles = roleCapabilities(user);

  useEffect(() => {
    const previous = document.title;
    document.title = "Page not found · OPedu";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <section className="information-page not-found-page">
      <header className="information-header">
        <div className="eyebrow">Error 404</div>
        <h1>We can&apos;t find that page.</h1>
        <p>
          <code>{pathname}</code> does not exist on OPedu. The link may be mistyped, or the page may
          have moved.
        </p>
      </header>
      <div className="hero-actions">
        {user ? (
          <Link className="button button-primary" to={roles.homePath}>
            Go to my workspace
          </Link>
        ) : (
          <Link className="button button-primary" to="/">
            Go to the home page
          </Link>
        )}
        {user ? null : (
          <Link className="button button-secondary" to="/login">
            Sign in
          </Link>
        )}
        <Link className="button button-secondary" to="/support">
          Get help
        </Link>
      </div>
    </section>
  );
}
