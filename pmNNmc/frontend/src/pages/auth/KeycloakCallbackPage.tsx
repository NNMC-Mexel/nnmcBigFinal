import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export default function KeycloakCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // Exchange Keycloak access_token with secondary backends (KPI, Conf, Journal)
  function exchangeSecondaryTokens(accessToken: string) {
    const kpiApiBase = import.meta.env.VITE_KPI_API_BASE;
    const confApiUrl = import.meta.env.VITE_CONF_API_URL;
    const journalApiUrl = import.meta.env.VITE_JOURNAL_API_URL;
    const encoded = encodeURIComponent(accessToken);

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

    return Promise.all([kpiPromise, confPromise, journalPromise]).then(
      ([kpiData, confData, journalData]) => {
        if (kpiData?.jwt) localStorage.setItem('kpi_token', kpiData.jwt);
        if (confData?.jwt) localStorage.setItem('conf_token', confData.jwt);
        if (journalData?.jwt) localStorage.setItem('journal_token', journalData.jwt);
      }
    );
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const jwt = params.get('jwt');

    if (jwt) {
      if (accessToken) {
        exchangeSecondaryTokens(accessToken).finally(() => handleJwt(jwt));
      } else {
        handleJwt(jwt);
      }
      return;
    }

    // Grant querystring transport: exchange access_token with all backends
    if (accessToken) {
      const apiUrl = import.meta.env.VITE_API_URL;
      const encoded = encodeURIComponent(accessToken);

      const pmPromise = fetch(`${apiUrl}/api/auth/keycloak/callback?access_token=${encoded}`)
        .then((res) => res.json());

      Promise.all([pmPromise, exchangeSecondaryTokens(accessToken)])
        .then(([pmData]) => {
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
