import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export default function KeycloakCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Direct JWT from Strapi (legacy flow)
    const jwt = params.get('jwt');
    if (jwt) {
      handleJwt(jwt);
      return;
    }

    // Grant querystring transport: Strapi passed raw Keycloak tokens to frontend.
    // Exchange the access_token for a Strapi JWT via /api/auth/keycloak/callback.
    // Also exchange it for KPI, Conference, and Journal JWTs so all modules work without separate login.
    const accessToken = params.get('access_token');
    if (accessToken) {
      const apiUrl = import.meta.env.VITE_API_URL;
      const kpiApiBase = import.meta.env.VITE_KPI_API_BASE; // e.g. http://host:12011/api
      const confApiUrl = import.meta.env.VITE_CONF_API_URL; // e.g. http://host:12013
      const journalApiUrl = import.meta.env.VITE_JOURNAL_API_URL; // e.g. http://host:12014
      const encoded = encodeURIComponent(accessToken);

      // Fire all requests in parallel; secondary failures are non-fatal
      const pmPromise = fetch(`${apiUrl}/api/auth/keycloak/callback?access_token=${encoded}`)
        .then((res) => res.json());
      const kpiPromise = kpiApiBase
        ? fetch(`${kpiApiBase}/auth/keycloak/callback?access_token=${encoded}`)
            .then((res) => res.json())
            .catch(() => null)
        : Promise.resolve(null);
      const confPromise = confApiUrl
        ? fetch(`${confApiUrl}/api/auth/keycloak/callback?access_token=${encoded}`)
            .then((res) => res.json())
            .catch(() => null)
        : Promise.resolve(null);
      const journalPromise = journalApiUrl
        ? fetch(`${journalApiUrl}/api/auth/keycloak/callback?access_token=${encoded}`)
            .then((res) => res.json())
            .catch(() => null)
        : Promise.resolve(null);

      Promise.all([pmPromise, kpiPromise, confPromise, journalPromise])
        .then(([pmData, kpiData, confData, journalData]) => {
          if (kpiData?.jwt) {
            localStorage.setItem('kpi_token', kpiData.jwt);
          }
          if (confData?.jwt) {
            localStorage.setItem('conf_token', confData.jwt);
          }
          if (journalData?.jwt) {
            localStorage.setItem('journal_token', journalData.jwt);
          }
          if (pmData?.jwt) {
            handleJwt(pmData.jwt);
          } else {
            setError(pmData?.error?.message || 'Не удалось получить токен от сервера');
          }
        })
        .catch(() => setError('Ошибка соединения с сервером'));
      return;
    }

    const errorMessage = params.get('errorMessage');
    setError(errorMessage ? decodeURIComponent(errorMessage) : 'Токен не получен от Keycloak');
  }, [navigate]);

  function handleJwt(jwt: string) {
    localStorage.setItem('jwt', jwt);
    authApi
      .getMe()
      .then((user) => {
        useAuthStore.setState({
          user,
          token: jwt,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        navigate('/app/news', { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('jwt');
        setError('Не удалось получить данные пользователя');
      });
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-md">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary-600 hover:underline text-sm"
          >
            Вернуться к входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 text-sm">Выполняется вход через Keycloak...</p>
      </div>
    </div>
  );
}
