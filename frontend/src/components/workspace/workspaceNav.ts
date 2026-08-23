import type { RoleCapabilities } from "../../auth/useRoles";

export type WorkspaceLink = {
  to: string;
  label: string;
  /** Matches nested routes, e.g. `/teach/learners/4` highlights the `/teach/learners` link. */
  end?: boolean;
};

export type WorkspaceSection = {
  heading: string;
  links: WorkspaceLink[];
};

/**
 * Builds the signed-in navigation from role capabilities.
 *
 * Every entry here must resolve to a route that exists — a navigation full of placeholder links
 * is worse than a short one. Later phases add their links as they add their pages.
 *
 * Routes that are reachable only by typing a URL are a bug: `/school/admin` was absent from the
 * navigation entirely under the previous shell, discoverable only through a button on the
 * instructor dashboard.
 */
export function workspaceSections(roles: RoleCapabilities): WorkspaceSection[] {
  const sections: WorkspaceSection[] = [];

  // Only users who actually learn on the platform get the learning section. The fallback covers
  // an account whose memberships grant no workspace at all, so it is never left with empty
  // navigation.
  const hasOtherWorkspace = roles.canReviewEvidence || roles.canAuthorContent;
  if (roles.isLearner || !hasOtherWorkspace) {
    sections.push({
      heading: "Learning",
      links: [{ to: "/learn", label: "My lessons", end: true }],
    });
  }

  if (roles.canReviewEvidence) {
    sections.push({
      heading: "Teaching",
      links: [{ to: "/teach", label: "Overview", end: true }],
    });
  }

  if (roles.canAuthorContent) {
    sections.push({
      heading: "Content",
      links: [{ to: "/authoring", label: "Scenarios", end: true }],
    });
  }

  if (roles.canAdministerSchool) {
    sections.push({
      heading: "School",
      links: [{ to: "/school/people", label: "People and access" }],
    });
  }

  const research: WorkspaceLink[] = [{ to: "/research/survey", label: "Survey" }];
  if (roles.canReviewEvidence) {
    research.unshift({ to: "/research/pilots", label: "Pilot governance" });
  }
  sections.push({ heading: "Research", links: research });

  sections.push({
    heading: "Account",
    links: [{ to: "/account/security", label: "Security" }],
  });

  return sections;
}
