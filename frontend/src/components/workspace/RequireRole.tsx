import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { User } from "../../api/client";
import { roleCapabilities, type RoleCapabilities } from "../../auth/useRoles";

type RequireRoleProps = {
  user: User | null;
  children: ReactNode;
  /**
   * Capability the route requires. Omit for routes that only require a signed-in user.
   * Named capabilities are preferred over raw role lists so the rule lives in one place.
   */
  capability?: keyof Pick<
    RoleCapabilities,
    "canReviewEvidence" | "canAuthorContent" | "canPublishContent" | "canAdministerSchool"
  >;
};

/**
 * Single gate for authenticated routes.
 *
 * Signed-out visitors go to `/login` carrying the path they wanted, which `LoginPage` reads back
 * from `location.state.from` to return them after signing in. Signed-in users who lack the
 * capability are sent to their own workspace home rather than a shared `/dashboard`.
 */
export function RequireRole({ user, capability, children }: RequireRoleProps) {
  const location = useLocation();
  const roles = roleCapabilities(user);

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (capability && !roles[capability]) {
    return <Navigate to={roles.homePath} replace />;
  }

  return <>{children}</>;
}
