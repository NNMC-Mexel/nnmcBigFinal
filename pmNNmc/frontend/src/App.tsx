import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useAuthStore, useUserRole } from './store/authStore';

// Layouts (small, eagerly loaded)
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';

// Auth pages (small, on critical path)
import LoginPage from './pages/auth/LoginPage';
import KeycloakCallbackPage from './pages/auth/KeycloakCallbackPage';
import DeepLinkHandler from './components/DeepLinkHandler';
import { isKeycloakEnabled, startKeycloakLogin } from './utils/keycloakAuth';

// Lazy auth pages (rarely visited)
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));

// Lazy app pages — split each module into its own chunk.
// Heavy modules (KPI, SignDoc, Admin) carry pdf-lib, fontkit, NCALayer, etc.
// and must NOT be in the initial bundle.
const NewsFeedPage = lazy(() => import('./pages/app/NewsFeedPage'));
const NewsAdminPage = lazy(() => import('./pages/app/NewsAdminPage'));
const DashboardPage = lazy(() => import('./pages/app/DashboardPage'));
const BoardPage = lazy(() => import('./pages/app/BoardPage'));
const TablePage = lazy(() => import('./pages/app/TablePage'));
const ProjectDetailPage = lazy(() => import('./pages/app/ProjectDetailPage'));
const ActivityLogPage = lazy(() => import('./pages/app/ActivityLogPage'));
const ProfilePage = lazy(() => import('./pages/app/ProfilePage'));
const NotificationsPage = lazy(() => import('./pages/app/NotificationsPage'));
const AdminPanelPage = lazy(() => import('./pages/app/AdminPanelPage'));
const EmployeeDirectoryPage = lazy(() => import('./pages/app/EmployeeDirectoryPage'));
const EmployeeCardPage = lazy(() => import('./pages/app/EmployeeCardPage'));
const HelpdeskPage = lazy(() => import('./pages/app/HelpdeskPage'));
const MyRequestsPage = lazy(() => import('./pages/app/MyRequestsPage'));
const TicketDetailPage = lazy(() => import('./pages/app/TicketDetailPage'));
const KpiItPage = lazy(() => import('./pages/app/KpiItPage'));
const KpiTimesheetPage = lazy(() => import('./pages/app/KpiTimesheetPage'));
const ConferenceRoomsPage = lazy(() => import('./pages/app/ConferenceRoomsPage'));
const JournalPage = lazy(() => import('./pages/app/JournalPage'));
const SignDocPage = lazy(() => import('./pages/app/SignDocPage'));
const ProtocolsPage = lazy(() => import('./pages/app/ProtocolsPage'));

// Lazy public pages
const PublicSurveyPage = lazy(() => import('./pages/public/PublicSurveyPage'));
const PublicTicketPage = lazy(() => import('./pages/public/PublicTicketPage'));

// Loader shown while a lazy chunk is being fetched.
const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="text-center">
      <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-slate-500 text-sm">Загрузка модуля…</p>
    </div>
  </div>
);

// Wrap a lazy element in Suspense.
const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{node}</Suspense>
);

// Protected Route component — redirects to Keycloak SSO when enabled.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    if (isKeycloakEnabled && !isLoading && !isAuthenticated) {
      startKeycloakLogin();
    }
  }, [isLoading, isAuthenticated]);

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
    if (!isKeycloakEnabled) {
      return <Navigate to="/login" replace />;
    }

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

const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin } = useUserRole();
  if (!isSuperAdmin) {
    return <DefaultAppRedirect />;
  }
  return <>{children}</>;
};

// Clean up all tokens when user lands on /logged-out
const LoggedOutPage = () => {
  useEffect(() => {
    // Clear all stored tokens and auth state
    useAuthStore.getState().logout();
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('kc_id_token');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-blue-50 to-emerald-50">
      <div className="text-center bg-white p-8 rounded-2xl shadow-lg">
        <img src="/logo.png" alt="ННМЦ" className="w-16 h-16 mx-auto mb-4 object-contain" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Вы вышли из системы</h2>
        <p className="text-slate-500 mb-6">Сессия завершена</p>
        <button
          onClick={startKeycloakLogin}
          className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
        >
          Войти снова
        </button>
      </div>
      <p className="mt-6 text-sm text-slate-400">© 2026 ТОО "Biocraft Digital"</p>
    </div>
  );
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
    canViewEmployeeDirectory,
  } = useUserRole();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
      <DeepLinkHandler />
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
            <PublicRoute>{withSuspense(<RegisterPage />)}</PublicRoute>
          }
        />
        <Route path="/forgot-password" element={withSuspense(<ForgotPasswordPage />)} />
        <Route path="/reset-password" element={withSuspense(<ResetPasswordPage />)} />
        <Route path="/verify-email" element={withSuspense(<VerifyEmailPage />)} />
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
        <Route path="news" element={withSuspense(<NewsFeedPage />)} />
        <Route
          path="news-admin"
          element={
            <FeatureRoute allow={canManageNews}>{withSuspense(<NewsAdminPage />)}</FeatureRoute>
          }
        />

        <Route
          path="dashboard"
          element={
            <FeatureRoute allow={canViewDashboard}>{withSuspense(<DashboardPage />)}</FeatureRoute>
          }
        />
        <Route
          path="board"
          element={
            <FeatureRoute allow={canViewBoard}>{withSuspense(<BoardPage />)}</FeatureRoute>
          }
        />
        <Route
          path="table"
          element={
            <FeatureRoute allow={canViewTable}>{withSuspense(<TablePage />)}</FeatureRoute>
          }
        />
        <Route
          path="projects/:id"
          element={
            <FeatureRoute allow={canViewBoard || canViewTable}>{withSuspense(<ProjectDetailPage />)}</FeatureRoute>
          }
        />
        <Route
          path="activity"
          element={
            <FeatureRoute allow={canViewActivityLog}>{withSuspense(<ActivityLogPage />)}</FeatureRoute>
          }
        />
        <Route path="profile" element={withSuspense(<ProfilePage />)} />
        <Route path="notifications" element={withSuspense(<NotificationsPage />)} />
        <Route
          path="admin"
          element={
            <SuperAdminRoute>{withSuspense(<AdminPanelPage />)}</SuperAdminRoute>
          }
        />
        <Route path="employees" element={<Navigate to="/app/bpm/employees" replace />} />
        <Route
          path="bpm/employees"
          element={
            <FeatureRoute allow={canViewEmployeeDirectory}>{withSuspense(<EmployeeDirectoryPage />)}</FeatureRoute>
          }
        />
        <Route
          path="bpm/employees/:id"
          element={
            <FeatureRoute allow={canViewEmployeeDirectory}>{withSuspense(<EmployeeCardPage />)}</FeatureRoute>
          }
        />
        <Route
          path="helpdesk"
          element={
            <FeatureRoute allow={canViewHelpdesk}>{withSuspense(<HelpdeskPage />)}</FeatureRoute>
          }
        />
        <Route
          path="my-requests"
          element={
            <FeatureRoute allow={canViewHelpdesk}>{withSuspense(<MyRequestsPage />)}</FeatureRoute>
          }
        />
        <Route
          path="helpdesk/submit"
          element={
            <FeatureRoute allow={canViewHelpdesk}>{withSuspense(<PublicTicketPage />)}</FeatureRoute>
          }
        />
        <Route
          path="helpdesk/:id"
          element={
            <FeatureRoute allow={canViewHelpdesk}>{withSuspense(<TicketDetailPage />)}</FeatureRoute>
          }
        />
        <Route
          path="kpi-it"
          element={
            <FeatureRoute allow={canViewKpiIt}>{withSuspense(<KpiItPage forcedDepartmentKey="IT" title="KPI IT" />)}</FeatureRoute>
          }
        />
        <Route
          path="kpi-medical"
          element={
            <FeatureRoute allow={canViewKpiMedical}>{withSuspense(<KpiItPage forcedDepartmentKey="MEDICAL_EQUIPMENT" title="KPI Медоборудование" />)}</FeatureRoute>
          }
        />
        <Route
          path="kpi-engineering"
          element={
            <FeatureRoute allow={canViewKpiEngineering}>{withSuspense(<KpiItPage forcedDepartmentKey="ENGINEERING" title="KPI Хозяйственная служба" />)}</FeatureRoute>
          }
        />
        <Route
          path="kpi-timesheet"
          element={
            <FeatureRoute allow={canViewKpiTimesheet}>{withSuspense(<KpiTimesheetPage />)}</FeatureRoute>
          }
        />
        <Route path="rooms" element={<FeatureRoute allow={canAccessConf}>{withSuspense(<ConferenceRoomsPage />)}</FeatureRoute>} />
        <Route path="journal" element={<FeatureRoute allow={canAccessJournal}>{withSuspense(<JournalPage />)}</FeatureRoute>} />
        <Route path="signdoc/*" element={<FeatureRoute allow={canAccessSigndoc}>{withSuspense(<SignDocPage />)}</FeatureRoute>} />
        <Route path="protocols/*" element={withSuspense(<ProtocolsPage />)} />
      </Route>

      {/* Logged out page — not protected, cleans up tokens on mount */}
      <Route path="/logged-out" element={<LoggedOutPage />} />

      {/* Public pages (no auth required) */}
      <Route path="/survey/:token" element={withSuspense(<PublicSurveyPage />)} />

      {/* Redirect root — if not authenticated, ProtectedRoute will redirect to Keycloak */}
      <Route path="/" element={<ProtectedRoute><DefaultAppRedirect /></ProtectedRoute>} />

      {/* 404 */}
      <Route path="*" element={<DefaultAppRedirect />} />
    </Routes>
    </>
  );
}

export default App;
