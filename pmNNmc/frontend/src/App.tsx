import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore, useUserRole } from './store/authStore';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import KeycloakCallbackPage from './pages/auth/KeycloakCallbackPage';

// App pages
import DashboardPage from './pages/app/DashboardPage';
import NewsFeedPage from './pages/app/NewsFeedPage';
import NewsAdminPage from './pages/app/NewsAdminPage';
import BoardPage from './pages/app/BoardPage';
import TablePage from './pages/app/TablePage';
import ProjectDetailPage from './pages/app/ProjectDetailPage';
import ActivityLogPage from './pages/app/ActivityLogPage';
import ProfilePage from './pages/app/ProfilePage';
import AdminPanelPage from './pages/app/AdminPanelPage';

// Public pages
import PublicSurveyPage from './pages/public/PublicSurveyPage';
import PublicTicketPage from './pages/public/PublicTicketPage';

// Helpdesk pages
import HelpdeskPage from './pages/app/HelpdeskPage';
import TicketDetailPage from './pages/app/TicketDetailPage';
import KpiItPage from './pages/app/KpiItPage';
import KpiTimesheetPage from './pages/app/KpiTimesheetPage';

// Protected Route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// Public Route (redirect if authenticated)
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (isAuthenticated) {
    return <DefaultAppRedirect />;
  }
  
  return <>{children}</>;
};

const DefaultAppRedirect = () => {
  // News feed is the default landing page for all authenticated users
  return <Navigate to="/app/news" replace />;
};

const FeatureRoute = ({ allow, children }: { allow: boolean; children: React.ReactNode }) => {
  if (!allow) {
    return <DefaultAppRedirect />;
  }
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, isSuperAdmin } = useUserRole();
  if (!isAdmin && !isSuperAdmin) {
    return <DefaultAppRedirect />;
  }
  return <>{children}</>;
};

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin } = useUserRole();
  if (!isSuperAdmin) {
    return <DefaultAppRedirect />;
  }
  return <>{children}</>;
};

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const {
    canViewDashboard,
    canViewBoard,
    canViewTable,
    canViewHelpdesk,
    canViewKpiIt,
    canViewKpiMedical,
    canViewKpiEngineering,
    canViewKpiTimesheet,
  } = useUserRole();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Public auth routes */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>

      {/* Keycloak SSO callback */}
      <Route path="/connect/keycloak/redirect" element={<KeycloakCallbackPage />} />

      {/* Protected app routes */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DefaultAppRedirect />} />

        {/* News feed — accessible to all authenticated users */}
        <Route path="news" element={<NewsFeedPage />} />
        <Route
          path="news-admin"
          element={
            <AdminRoute>
              <NewsAdminPage />
            </AdminRoute>
          }
        />

        <Route
          path="dashboard"
          element={
            <FeatureRoute allow={canViewDashboard}>
              <DashboardPage />
            </FeatureRoute>
          }
        />
        <Route
          path="board"
          element={
            <FeatureRoute allow={canViewBoard}>
              <BoardPage />
            </FeatureRoute>
          }
        />
        <Route
          path="table"
          element={
            <FeatureRoute allow={canViewTable}>
              <TablePage />
            </FeatureRoute>
          }
        />
        <Route
          path="projects/:id"
          element={
            <FeatureRoute allow={canViewBoard || canViewTable}>
              <ProjectDetailPage />
            </FeatureRoute>
          }
        />
        <Route
          path="activity"
          element={
            <AdminRoute>
              <ActivityLogPage />
            </AdminRoute>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin"
          element={
            <SuperAdminRoute>
              <AdminPanelPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="helpdesk"
          element={
            <FeatureRoute allow={canViewHelpdesk}>
              <HelpdeskPage />
            </FeatureRoute>
          }
        />
        <Route
          path="helpdesk/:id"
          element={
            <FeatureRoute allow={canViewHelpdesk}>
              <TicketDetailPage />
            </FeatureRoute>
          }
        />
        <Route
          path="kpi-it"
          element={
            <FeatureRoute allow={canViewKpiIt}>
              <KpiItPage forcedDepartmentKey="IT" title="KPI IT" />
            </FeatureRoute>
          }
        />
        <Route
          path="kpi-medical"
          element={
            <FeatureRoute allow={canViewKpiMedical}>
              <KpiItPage forcedDepartmentKey="MEDICAL_EQUIPMENT" title="KPI Медоборудование" />
            </FeatureRoute>
          }
        />
        <Route
          path="kpi-engineering"
          element={
            <FeatureRoute allow={canViewKpiEngineering}>
              <KpiItPage forcedDepartmentKey="ENGINEERING" title="KPI Инженерная служба" />
            </FeatureRoute>
          }
        />
        <Route
          path="kpi-timesheet"
          element={
            <FeatureRoute allow={canViewKpiTimesheet}>
              <KpiTimesheetPage />
            </FeatureRoute>
          }
        />
      </Route>

      {/* Public pages (no auth required) */}
      <Route path="/survey/:token" element={<PublicSurveyPage />} />
      <Route path="/helpdesk/submit" element={<PublicTicketPage />} />

      {/* Redirect root to app or login */}
      <Route path="/" element={<DefaultAppRedirect />} />
      
      {/* 404 */}
      <Route path="*" element={<DefaultAppRedirect />} />
    </Routes>
  );
}

export default App;
