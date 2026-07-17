import { lazy, Suspense, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { useCurrentUser } from "./auth/useAuth";
import { DashboardPage } from "./pages/DashboardPage";
import { AssignmentPage } from "./pages/AssignmentPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { InstructorAttemptPage } from "./pages/InstructorAttemptPage";
import { AccountSecurityPage } from "./pages/AccountSecurityPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { JoinSchoolPage } from "./pages/JoinSchoolPage";
import { SchoolAdminPage } from "./pages/SchoolAdminPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SupportPage } from "./pages/SupportPage";
import { AboutPage } from "./pages/AboutPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { UpdatesPage } from "./pages/UpdatesPage";
import { ContactPage } from "./pages/ContactPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";

const SimulationPage = lazy(() =>
  import("./pages/SimulationPage").then((module) => ({ default: module.SimulationPage })),
);

export function App() {
  const auth = useCurrentUser();
  const queryClient = useQueryClient();
  const location = useLocation();

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

  const user = auth.data;
  const canReviewEvidence =
    user?.roles.some(
      (role) => role === "platform_admin" || role === "instructor" || role === "admin",
    ) ?? false;
  return (
    <AppShell user={user}>
      <Routes>
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
        <Route
          path="/account/security"
          element={
            user ? (
              <AccountSecurityPage />
            ) : (
              <Navigate to="/login" state={{ from: location.pathname }} replace />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            user ? (
              <DashboardPage user={user} />
            ) : (
              <Navigate to="/login" state={{ from: location.pathname }} replace />
            )
          }
        />
        <Route
          path="/assignments/:assignmentId"
          element={
            user ? (
              <AssignmentPage />
            ) : (
              <Navigate to="/login" state={{ from: location.pathname }} replace />
            )
          }
        />
        <Route
          path="/attempts/:attemptId"
          element={
            user ? (
              <Suspense fallback={<p className="panel-status">Loading the 3D workshop…</p>}>
                <SimulationPage />
              </Suspense>
            ) : (
              <Navigate to="/login" state={{ from: location.pathname }} replace />
            )
          }
        />
        <Route
          path="/instructor/attempts/:attemptId"
          element={
            user && canReviewEvidence ? (
              <InstructorAttemptPage />
            ) : (
              <Navigate
                to={user ? "/dashboard" : "/login"}
                state={{ from: location.pathname }}
                replace
              />
            )
          }
        />
        <Route
          path="/school/admin"
          element={
            user?.roles.some((role) => role === "platform_admin" || role === "admin") ? (
              <SchoolAdminPage />
            ) : (
              <Navigate to={user ? "/dashboard" : "/login"} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
