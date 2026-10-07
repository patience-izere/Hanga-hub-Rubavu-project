import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireRole } from "./components/workspace/RequireRole";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { useCurrentUser } from "./auth/useAuth";
import { roleCapabilities } from "./auth/useRoles";
import { useApplyPreferredLocale } from "./i18n/LocaleProvider";
import { LearnerDashboardPage } from "./pages/LearnerDashboardPage";
import { LearnerProgressPage } from "./pages/LearnerProgressPage";
import { AttemptResultPage } from "./pages/AttemptResultPage";
import { AssignmentPage } from "./pages/AssignmentPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { InstructorDashboardPage } from "./pages/InstructorDashboardPage";
import { InstructorAttemptPage } from "./pages/InstructorAttemptPage";
import { InstructorAssignPage } from "./pages/InstructorAssignPage";
import { InstructorLearnersPage } from "./pages/InstructorLearnersPage";
import { InstructorLearnerDetailPage } from "./pages/InstructorLearnerDetailPage";
import { InstructorCompetenciesPage } from "./pages/InstructorCompetenciesPage";
import { InstructorOperationsPage } from "./pages/InstructorOperationsPage";
import { AccountSecurityPage } from "./pages/AccountSecurityPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { JoinSchoolPage } from "./pages/JoinSchoolPage";
import { SchoolOverviewPage } from "./pages/SchoolOverviewPage";
import { SchoolPeoplePage } from "./pages/SchoolPeoplePage";
import { SchoolInvitationsPage } from "./pages/SchoolInvitationsPage";
import { SchoolAuditPage } from "./pages/SchoolAuditPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SupportPage } from "./pages/SupportPage";
import { AboutPage } from "./pages/AboutPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { UpdatesPage } from "./pages/UpdatesPage";
import { ContactPage } from "./pages/ContactPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";
import { ResearchSurveyPage } from "./pages/ResearchSurveyPage";
import { ContentAuthoringPage } from "./pages/ContentAuthoringPage";
import { AuthoringAssetsPage } from "./pages/AuthoringAssetsPage";
import { TrainingMarkerPage } from "./pages/TrainingMarkerPage";

const SimulationPage = lazy(() =>
  import("./pages/SimulationPage").then((module) => ({ default: module.SimulationPage })),
);
const PilotAdministrationPage = lazy(() =>
  import("./pages/PilotAdministrationPage").then((module) => ({
    default: module.PilotAdministrationPage,
  })),
);

function Loading({ label, children }: { label: string; children: ReactNode }) {
  return <Suspense fallback={<p className="panel-status">{label}</p>}>{children}</Suspense>;
}

export function App() {
  const auth = useCurrentUser();
  const queryClient = useQueryClient();
  useApplyPreferredLocale(auth.data?.preferredLanguage);

  useEffect(() => {
    const expireSession = () => queryClient.setQueryData(["auth", "current-user"], null);
    window.addEventListener("opedu:session-expired", expireSession);
    return () => window.removeEventListener("opedu:session-expired", expireSession);
  }, [queryClient]);

  if (auth.isPending) {
    return (
      <div className="full-page-status" role="status">
        Loading OPedu…
      </div>
    );
  }

  if (auth.isError) {
    return (
      <div className="full-page-status" role="alert">
        <h1>We could not reach the learning service.</h1>
        <p>Check that the Django API is running, then refresh this page.</p>
      </div>
    );
  }

  const user = auth.data ?? null;
  const roles = roleCapabilities(user);

  return (
    <Routes>
      {/* Public site — marketing, authentication and invitation acceptance. */}
      <Route element={<AppShell user={user} />}>
        <Route path="/" element={<HomePage user={user} />} />
        <Route path="/login" element={<LoginPage user={user} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
        <Route path="/join/:token" element={<JoinSchoolPage />} />
        <Route path="/onboarding" element={<OnboardingPage user={user} />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage user={user} />} />
        <Route path="/updates" element={<UpdatesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/markers/battery" element={<TrainingMarkerPage />} />
      </Route>

      {/* Workspace — the signed-in surface, one route per role responsibility. */}
      <Route element={user ? <WorkspaceShell user={user} /> : <Navigate to="/login" replace />}>
        {/* Learner */}
        <Route
          path="/learn"
          element={
            <RequireRole user={user}>
              <LearnerDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/learn/progress"
          element={
            <RequireRole user={user}>
              <LearnerProgressPage />
            </RequireRole>
          }
        />
        <Route
          path="/learn/attempts/:attemptId"
          element={
            <RequireRole user={user}>
              <AttemptResultPage />
            </RequireRole>
          }
        />
        <Route
          path="/assignments/:assignmentId"
          element={
            <RequireRole user={user}>
              <AssignmentPage />
            </RequireRole>
          }
        />
        <Route
          path="/attempts/:attemptId"
          element={
            <RequireRole user={user}>
              <Loading label="Loading the 3D workshop…">
                <SimulationPage />
              </Loading>
            </RequireRole>
          }
        />

        {/* Instructor */}
        <Route
          path="/teach"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/learners"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorLearnersPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/learners/:learnerId"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorLearnerDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/assign"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorAssignPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/competencies"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorCompetenciesPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/operations"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorOperationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/teach/attempts/:attemptId"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <InstructorAttemptPage />
            </RequireRole>
          }
        />

        {/* Content author */}
        <Route
          path="/authoring"
          element={
            <RequireRole user={user} capability="canAuthorContent">
              <ContentAuthoringPage canPublish={roles.canPublishContent} />
            </RequireRole>
          }
        />
        <Route
          path="/authoring/scenarios/:scenarioId"
          element={
            <RequireRole user={user} capability="canAuthorContent">
              <ContentAuthoringPage canPublish={roles.canPublishContent} />
            </RequireRole>
          }
        />
        <Route
          path="/authoring/assets"
          element={
            <RequireRole user={user} capability="canAuthorContent">
              <AuthoringAssetsPage canPublish={roles.canPublishContent} />
            </RequireRole>
          }
        />

        {/* School administration */}
        <Route
          path="/school"
          element={
            <RequireRole user={user} capability="canAdministerSchool">
              <SchoolOverviewPage />
            </RequireRole>
          }
        />
        <Route
          path="/school/people"
          element={
            <RequireRole user={user} capability="canAdministerSchool">
              <SchoolPeoplePage />
            </RequireRole>
          }
        />
        <Route
          path="/school/invitations"
          element={
            <RequireRole user={user} capability="canAdministerSchool">
              <SchoolInvitationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/school/audit"
          element={
            <RequireRole user={user} capability="canAdministerSchool">
              <SchoolAuditPage />
            </RequireRole>
          }
        />

        {/* Research */}
        <Route
          path="/research/survey"
          element={
            <RequireRole user={user}>
              <ResearchSurveyPage />
            </RequireRole>
          }
        />
        <Route
          path="/research/pilots"
          element={
            <RequireRole user={user} capability="canReviewEvidence">
              <Loading label="Loading pilot governance…">
                <PilotAdministrationPage user={user!} />
              </Loading>
            </RequireRole>
          }
        />

        {/* Account */}
        <Route
          path="/account/security"
          element={
            <RequireRole user={user}>
              <AccountSecurityPage />
            </RequireRole>
          }
        />
      </Route>

      {/* Compatibility redirects for paths that existed before the workspace split. */}
      <Route path="/dashboard" element={<Navigate to={roles.homePath} replace />} />
      <Route path="/school/admin" element={<Navigate to="/school/people" replace />} />
      <Route path="/instructor/attempts/:attemptId" element={<InstructorAttemptRedirect />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Preserves links to the pre-workspace instructor evidence path. */
function InstructorAttemptRedirect() {
  const { attemptId } = useParams();
  return <Navigate to={`/teach/attempts/${attemptId}`} replace />;
}
