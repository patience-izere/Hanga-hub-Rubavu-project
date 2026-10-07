import type { RoleCapabilities } from "../../auth/useRoles";
import type { MessageKey } from "../../i18n/messages";

export type WorkspaceLink = {
  to: string;
  /** Message key resolved through the active locale at render time. */
  label: MessageKey;
  /** Matches nested routes, e.g. `/teach/learners/4` highlights the `/teach/learners` link. */
  end?: boolean;
  /**
   * Extra path prefixes that should also highlight this link. Needed where a sibling route
   * would otherwise prefix-match, e.g. `/authoring/assets` under `/authoring`.
   */
  alsoActiveFor?: string[];
};

export type WorkspaceSection = {
  heading: MessageKey;
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
      heading: "nav.learning",
      links: [
        { to: "/learn", label: "nav.myLessons", end: true },
        { to: "/learn/progress", label: "nav.myProgress" },
      ],
    });
  }

  if (roles.canReviewEvidence) {
    sections.push({
      heading: "nav.teaching",
      links: [
        { to: "/teach", label: "nav.overview", end: true },
        { to: "/teach/learners", label: "nav.learners" },
        { to: "/teach/assign", label: "nav.assign" },
        { to: "/teach/competencies", label: "nav.competencies" },
        { to: "/teach/operations", label: "nav.operations" },
      ],
    });
  }

  if (roles.canAuthorContent) {
    sections.push({
      heading: "nav.content",
      links: [
        {
          to: "/authoring",
          label: "nav.scenarios",
          end: true,
          alsoActiveFor: ["/authoring/scenarios"],
        },
        { to: "/authoring/assets", label: "nav.assets" },
      ],
    });
  }

  if (roles.canAdministerSchool) {
    sections.push({
      heading: "nav.school",
      links: [
        { to: "/school", label: "nav.overview", end: true },
        { to: "/school/people", label: "nav.people" },
        { to: "/school/invitations", label: "nav.invitations" },
        { to: "/school/audit", label: "nav.audit" },
      ],
    });
  }

  const research: WorkspaceLink[] = [{ to: "/research/survey", label: "nav.survey" }];
  if (roles.canReviewEvidence) {
    research.unshift({ to: "/research/pilots", label: "nav.pilots" });
  }
  sections.push({ heading: "nav.research", links: research });

  sections.push({
    heading: "nav.account",
    links: [{ to: "/account/security", label: "security" }],
  });

  return sections;
}
