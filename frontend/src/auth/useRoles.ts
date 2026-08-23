import type { User } from "../api/client";
import { useCurrentUser } from "./useAuth";

export type Role = User["roles"][number];

/**
 * Every role predicate the product branches on, derived once from the current user.
 *
 * Role checks were previously inlined as `roles.some(...)` at each call site, which let the
 * same rule drift between the route guard, the navigation and the page. Add new predicates
 * here rather than re-deriving them in a component.
 */
export type RoleCapabilities = {
  isSignedIn: boolean;
  isLearner: boolean;
  isInstructor: boolean;
  isSchoolAdmin: boolean;
  isContentAuthor: boolean;
  isPlatformAdmin: boolean;
  /** Instructors and administrators may read school-scoped learner evidence. */
  canReviewEvidence: boolean;
  /** Content authors and administrators may open the authoring workspace. */
  canAuthorContent: boolean;
  /** Only administrators may approve, publish, return or retire authored content. */
  canPublishContent: boolean;
  /** Only administrators manage school membership and invitations. */
  canAdministerSchool: boolean;
  /** Where this user's workspace begins; also the post-login and `/dashboard` target. */
  homePath: string;
  has(...roles: Role[]): boolean;
};

const SIGNED_OUT_HOME = "/login";

export function roleCapabilities(user: User | null | undefined): RoleCapabilities {
  const roles = user?.roles ?? [];
  const has = (...candidates: Role[]) => candidates.some((role) => roles.includes(role));

  const isPlatformAdmin = has("platform_admin");
  const isSchoolAdmin = has("admin");
  const isInstructor = has("instructor");
  const isContentAuthor = has("content_author");
  const isLearner = has("learner");

  const canAdministerSchool = isPlatformAdmin || isSchoolAdmin;
  const canReviewEvidence = canAdministerSchool || isInstructor;
  const canAuthorContent = canAdministerSchool || isContentAuthor;

  return {
    isSignedIn: Boolean(user),
    isLearner,
    isInstructor,
    isSchoolAdmin,
    isContentAuthor,
    isPlatformAdmin,
    canReviewEvidence,
    canAuthorContent,
    canPublishContent: canAdministerSchool,
    canAdministerSchool,
    homePath: homePathFor({
      isSignedIn: Boolean(user),
      canAdministerSchool,
      canReviewEvidence,
      canAuthorContent,
    }),
    has,
  };
}

/**
 * Role capabilities for the signed-in user. Backed by the same cached auth query the shell
 * reads, so calling this from a page costs no extra request.
 */
export function useRoles(): RoleCapabilities {
  return roleCapabilities(useCurrentUser().data);
}

/**
 * The most privileged workspace a user can act in wins, so an administrator who also holds an
 * instructor membership lands on `/school` rather than `/teach`.
 */
function homePathFor(input: {
  isSignedIn: boolean;
  canAdministerSchool: boolean;
  canReviewEvidence: boolean;
  canAuthorContent: boolean;
}): string {
  if (!input.isSignedIn) return SIGNED_OUT_HOME;
  if (input.canAdministerSchool) return "/school";
  if (input.canReviewEvidence) return "/teach";
  if (input.canAuthorContent) return "/authoring";
  return "/learn";
}
