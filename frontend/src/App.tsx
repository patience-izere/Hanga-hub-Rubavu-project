import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useParams,
} from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireRole } from "./components/workspace/RequireRole";
import { isNetworkError } from "./api/client";
import { useCurrentUser } from "./auth/useAuth";
import { roleCapabilities } from "./auth/useRoles";
import { useApplyPreferredLocale } from "./i18n/LocaleProvider";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { JoinSchoolPage } from "./pages/JoinSchoolPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SupportPage } from "./pages/SupportPage";
import { AboutPage } from "./pages/AboutPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { UpdatesPage } from "./pages/UpdatesPage";
import { ContactPage } from "./pages/ContactPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";
import { TrainingMarkerPage } from "./pages/TrainingMarkerPage";
import { ClassJoinPage } from "./pages/ClassJoinPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RegisterSchoolPage } from "./pages/RegisterSchoolPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Workspace pages load on demand, so each person downloads only the screens their role uses.
 * Learners on mobile data no longer fetch the instructor, school and Studio code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pages take different props
type PageComponent = ComponentType<any>;

function lazyPage<M extends Record<K, PageComponent>, K extends string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

// The signed-in shell (and its styles) loads only for people who sign in.
const WorkspaceShell = lazyPage(
  () => import("./components/workspace/WorkspaceShell"),
  "WorkspaceShell",
);
const LearnerDashboardPage = lazyPage(
  () => import("./pages/LearnerDashboardPage"),
  "LearnerDashboardPage",
);
const LearnerProgressPage = lazyPage(
  () => import("./pages/LearnerProgressPage"),
  "LearnerProgressPage",
);
const CataloguePage = lazyPage(() => import("./pages/CataloguePage"), "CataloguePage");
const CertificatePage = lazyPage(() => import("./pages/CertificatePage"), "CertificatePage");
const VerifyCertificatePage = lazyPage(
  () => import("./pages/CertificatePage"),
  "VerifyCertificatePage",
);
const ClassAccessPage = lazyPage(() => import("./pages/ClassAccessPage"), "ClassAccessPage");
const LiveBoardPage = lazyPage(() => import("./pages/LiveBoardPage"), "LiveBoardPage");
const DemoPage = lazy(() =>
  import("./pages/DemoPage").then((module) => ({ default: module.DemoPage })),
);
const AttemptResultPage = lazyPage(() => import("./pages/AttemptResultPage"), "AttemptResultPage");
const AssignmentPage = lazyPage(() => import("./pages/AssignmentPage"), "AssignmentPage");
const InstructorDashboardPage = lazyPage(
  () => import("./pages/InstructorDashboardPage"),
  "InstructorDashboardPage",
);
const InstructorAttemptPage = lazyPage(
  () => import("./pages/InstructorAttemptPage"),
  "InstructorAttemptPage",
);
const InstructorAssignPage = lazyPage(
  () => import("./pages/InstructorAssignPage"),
  "InstructorAssignPage",
);
const InstructorLearnersPage = lazyPage(
  () => import("./pages/InstructorLearnersPage"),
  "InstructorLearnersPage",
);
const InstructorLearnerDetailPage = lazyPage(
  () => import("./pages/InstructorLearnerDetailPage"),
  "InstructorLearnerDetailPage",
);
const InstructorCompetenciesPage = lazyPage(
  () => import("./pages/InstructorCompetenciesPage"),
  "InstructorCompetenciesPage",
);
const InstructorOperationsPage = lazyPage(
  () => import("./pages/InstructorOperationsPage"),
  "InstructorOperationsPage",
);
const AccountSecurityPage = lazyPage(
  () => import("./pages/AccountSecurityPage"),
  "AccountSecurityPage",
);
const AccountProfilePage = lazyPage(
  () => import("./pages/AccountProfilePage"),
  "AccountProfilePage",
);
const PlatformSchoolsPage = lazyPage(
  () => import("./pages/PlatformSchoolsPage"),
  "PlatformSchoolsPage",
);
const SchoolOverviewPage = lazyPage(
  () => import("./pages/SchoolOverviewPage"),
  "SchoolOverviewPage",
);
const SchoolPeoplePage = lazyPage(() => import("./pages/SchoolPeoplePage"), "SchoolPeoplePage");
const SchoolInvitationsPage = lazyPage(
  () => import("./pages/SchoolInvitationsPage"),
  "SchoolInvitationsPage",
);
const SchoolClassesPage = lazyPage(() => import("./pages/SchoolClassesPage"), "SchoolClassesPage");
const SchoolAuditPage = lazyPage(() => import("./pages/SchoolAuditPage"), "SchoolAuditPage");
const ResearchSurveyPage = lazyPage(
  () => import("./pages/ResearchSurveyPage"),
  "ResearchSurveyPage",
);
const ContentAuthoringPage = lazyPage(
  () => import("./pages/ContentAuthoringPage"),
  "ContentAuthoringPage",
);
const LessonEditorPage = lazyPage(() => import("./pages/LessonEditorPage"), "LessonEditorPage");
const StudioHomePage = lazyPage(() => import("./pages/StudioHomePage"), "StudioHomePage");
const AuthoringAssetsPage = lazyPage(
  () => import("./pages/AuthoringAssetsPage"),
  "AuthoringAssetsPage",
);
const SimulationPage = lazy(() =>
  import("./pages/SimulationPage").then((module) => ({ default: module.SimulationPage })),
);
const PilotAdministrationPage = lazy(() =>
  import("./pages/PilotAdministrationPage").then((module) => ({
    default: module.PilotAdministrationPage,
  })),
);

/**
 * A new page starts at the top. Back and Forward keep the browser's restored position, and a
 * link to `#section` scrolls to that section once it is on the page.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}

/** Sends a signed-out visitor to login, remembering where they were going. */
function SignInFirst() {
  const location = useLocation();
  return (
    <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  );
}

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
    const offline = isNetworkError(auth.error);
    return (
      <div className="full-page-status" role="alert">
        <h1>{offline ? "You're offline." : "OPedu is not responding."}</h1>
        <p>
          {offline
            ? "Connect to the internet once to sign in. After that, lessons you download open without a connection."
            : "The learning service did not answer. Wait a moment and try again."}
        </p>
        <button className="button button-primary" type="button" onClick={() => void auth.refetch()}>
          {auth.isFetching ? "Trying…" : "Try again"}
        </button>
      </div>
    );
  }

  const user = auth.data ?? null;
  const roles = roleCapabilities(user);

  return (
    <>
      <ScrollToTop />
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
          <Route path="/class" element={<ClassJoinPage user={user} />} />
          <Route path="/class/:code" element={<ClassJoinPage user={user} />} />
          <Route path="/register" element={<RegisterPage user={user} />} />
          <Route path="/register-school" element={<RegisterSchoolPage />} />
          <Route
            path="/demo"
            element={
              <Loading label="Loading the demonstration workshop…">
                <DemoPage />
              </Loading>
            }
          />
          <Route
            path="/verify/:code"
            element={
              <Loading label="Checking…">
                <VerifyCertificatePage />
              </Loading>
            }
          />
        </Route>

        {/* Workspace — the signed-in surface, one route per role responsibility. */}
        <Route
          element={
            user ? (
              <Suspense
                fallback={
                  <div className="full-page-status" role="status">
                    Loading OPedu…
                  </div>
                }
              >
                <WorkspaceShell user={user} />
              </Suspense>
            ) : (
              <SignInFirst />
            )
          }
        >
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
            path="/learn/catalogue"
            element={
              <RequireRole user={user}>
                <CataloguePage />
              </RequireRole>
            }
          />
          <Route
            path="/learn/attempts/:attemptId/certificate"
            element={
              <RequireRole user={user}>
                <CertificatePage />
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
            path="/teach/classes"
            element={
              <RequireRole user={user} capability="canReviewEvidence">
                <ClassAccessPage />
              </RequireRole>
            }
          />
          <Route
            path="/teach/live"
            element={
              <RequireRole user={user} capability="canReviewEvidence">
                <LiveBoardPage />
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
                <StudioHomePage />
              </RequireRole>
            }
          />
          <Route
            path="/authoring/lessons/new"
            element={
              <RequireRole user={user} capability="canAuthorContent">
                <LessonEditorPage />
              </RequireRole>
            }
          />
          <Route
            path="/authoring/lessons/:lessonId"
            element={
              <RequireRole user={user} capability="canAuthorContent">
                <LessonEditorPage />
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
            path="/school/classes"
            element={
              <RequireRole user={user} capability="canAdministerSchool">
                <SchoolClassesPage />
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

          {/* Platform administration */}
          <Route
            path="/platform/schools"
            element={
              <RequireRole user={user} capability="isPlatformAdmin">
                <PlatformSchoolsPage />
              </RequireRole>
            }
          />

          {/* Account */}
          <Route
            path="/account/profile"
            element={
              <RequireRole user={user}>
                <AccountProfilePage />
              </RequireRole>
            }
          />
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

        <Route element={<AppShell user={user} />}>
          <Route path="*" element={<NotFoundPage user={user} />} />
        </Route>
      </Routes>
    </>
  );
}

/** Preserves links to the pre-workspace instructor evidence path. */
function InstructorAttemptRedirect() {
  const { attemptId } = useParams();
  return <Navigate to={`/teach/attempts/${attemptId}`} replace />;
}
