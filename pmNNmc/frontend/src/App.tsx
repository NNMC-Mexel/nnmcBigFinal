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
import ConferenceRoomsPage from './pages/app/ConferenceRoomsPage';
import JournalPage from './pages/app/JournalPage';
import SignDocPage from './pages/app/SignDocPage';

// Protected Route component — redirects to Keycloak SSO
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const apiUrl = import.meta.env.VITE_API_URL;
    window.location.href = `${apiUrl}/api/connect/keycloak`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Перенаправление на страницу входа...</p>
        </div>
      </div>
    );
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
    canManageNews,
    canViewActivityLog,
    canAccessConf,
    canAccessJournal,
    canAccessSigndoc,
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
            <FeatureRoute allow={canManageNews}>
              <NewsAdminPage />
            </FeatureRoute>
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
            <FeatureRoute allow={canViewActivityLog}>
              <ActivityLogPage />
            </FeatureRoute>
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
        <Route path="rooms" element={<FeatureRoute allow={canAccessConf}><ConferenceRoomsPage /></FeatureRoute>} />
        <Route path="journal" element={<FeatureRoute allow={canAccessJournal}><JournalPage /></FeatureRoute>} />
        <Route path="signdoc/*" element={<FeatureRoute allow={canAccessSigndoc}><SignDocPage /></FeatureRoute>} />
      </Route>

      {/* Logged out page — not protected, prevents auto-redirect to Keycloak */}
      <Route path="/logged-out" element={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Вы вышли из системы</h2>
            <p className="text-slate-500 mb-6">Сессия завершена</p>
            <button
              onClick={() => {
                const apiUrl = import.meta.env.VITE_API_URL;
                window.location.href = `${apiUrl}/api/connect/keycloak`;
              }}
              className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
            >
              Войти снова
            </button>
          </div>
        </div>
      } />

      {/* Public pages (no auth required) */}
      <Route path="/survey/:token" element={<PublicSurveyPage />} />
      <Route path="/helpdesk/submit" element={<PublicTicketPage />} />

      {/* Redirect root — if not authenticated, ProtectedRoute will redirect to Keycloak */}
      <Route path="/" element={<ProtectedRoute><DefaultAppRedirect /></ProtectedRoute>} />
      
      {/* 404 */}
      <Route path="*" element={<DefaultAppRedirect />} />
    </Routes>
  );
}

export default App;
