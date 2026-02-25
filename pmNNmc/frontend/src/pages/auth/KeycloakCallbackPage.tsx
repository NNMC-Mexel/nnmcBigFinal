import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export default function KeycloakCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jwt = params.get('jwt');

    if (!jwt) {
      setError('Токен не получен от Keycloak');
      return;
    }

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
  }, [navigate]);

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
