/**
 * KpiTimesheetPage
 *
 * Wrapper page for the embedded KPI Timesheet module.
 * Manages KPI-specific authentication (separate from pmNNmc auth):
 *
 * - Checks kpi_token in localStorage on mount
 * - If valid → renders KpiTimesheetModule
 * - If not → shows a login form (styled in pmNNmc/Tailwind design)
 *
 * Auth strategy (temporary, Keycloak-ready):
 *   User logs into pmNNmc normally. When visiting /app/kpi-timesheet,
 *   they authenticate once against kpiServer Strapi using the same
 *   credentials (admin sets up matching accounts in both Strapi instances).
 *   The kpi_token persists in localStorage across sessions.
 *
 * Future migration to Keycloak: replace apiLogin/apiMe calls here
 * with a token exchange flow — no changes needed in KpiTimesheetModule.
 */

import { useState, useEffect } from 'react';
import { BarChart2, LogIn, Eye, EyeOff } from 'lucide-react';
// @ts-ignore — JS module, no types needed
import KpiTimesheetModule from '../../modules/kpiTimesheet/KpiTimesheetModule';
import { apiLogin, apiMe } from '../../modules/kpiTimesheet/kpiApi';

const KPI_TOKEN_KEY = 'kpi_token';
const KPI_USER_KEY = 'kpi_user_cache_v1';

interface KpiUser {
  login: string;
  role: string;
  allowedDepartments: string[];
}

export default function KpiTimesheetPage() {
  const [kpiUser, setKpiUser] = useState<KpiUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Восстановление сессии при монтировании
  useEffect(() => {
    const token = localStorage.getItem(KPI_TOKEN_KEY);
    if (!token) {
      setAuthChecked(true);
      return;
    }
    // Проверяем токен через /users/me
    (apiMe as () => Promise<KpiUser>)()
      .then((data) => {
        setKpiUser(data);
        localStorage.setItem(KPI_USER_KEY, JSON.stringify(data));
      })
      .catch(() => {
        // Токен устарел — сбрасываем
        localStorage.removeItem(KPI_TOKEN_KEY);
        localStorage.removeItem(KPI_USER_KEY);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await (apiLogin as (l: string, p: string) => Promise<{ login: string; role: string; allowedDepartments: string[]; token: string }>)(
        loginForm.login,
        loginForm.password
      );
      const user: KpiUser = {
        login: data.login,
        role: data.role,
        allowedDepartments: data.allowedDepartments || [],
      };
      localStorage.setItem(KPI_USER_KEY, JSON.stringify(user));
      setKpiUser(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      setLoginError(msg || 'Ошибка авторизации. Проверьте логин и пароль.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleKpiLogout = () => {
    localStorage.removeItem(KPI_TOKEN_KEY);
    localStorage.removeItem(KPI_USER_KEY);
    localStorage.removeItem('kpi_cache_v1');
    setKpiUser(null);
    setLoginForm({ login: '', password: '' });
    setLoginError('');
  };

  // Загрузка
  if (!authChecked) {
    return (
      <div className='flex items-center justify-center min-h-64'>
        <div className='text-slate-500 text-sm'>Загрузка KPI модуля…</div>
      </div>
    );
  }

  // Авторизован — показываем модуль
  if (kpiUser) {
    return <KpiTimesheetModule user={kpiUser} onKpiLogout={handleKpiLogout} />;
  }

  // Форма логина (стиль pmNNmc / TailwindCSS)
  return (
    <div className='flex items-center justify-center min-h-[60vh]'>
      <div className='w-full max-w-md'>
        {/* Заголовок */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-medical-500 mb-4'>
            <BarChart2 className='w-7 h-7 text-white' />
          </div>
          <h1 className='text-2xl font-bold text-slate-800 mb-1'>KPI Табель</h1>
          <p className='text-slate-500 text-sm'>
            Войдите, используя учётные данные KPI-системы
          </p>
        </div>

        {/* Карточка формы */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-lg p-6'>
          <form onSubmit={handleLogin} className='space-y-4'>
            {/* Логин */}
            <div>
              <label className='block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5'>
                Логин
              </label>
              <input
                type='text'
                value={loginForm.login}
                onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value })}
                placeholder='Введите логин'
                required
                autoComplete='username'
                className='w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-colors'
              />
            </div>

            {/* Пароль */}
            <div>
              <label className='block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5'>
                Пароль
              </label>
              <div className='relative'>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder='Введите пароль'
                  required
                  autoComplete='current-password'
                  className='w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-colors'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword((v) => !v)}
                  className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors'
                >
                  {showPassword ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                </button>
              </div>
            </div>

            {/* Ошибка */}
            {loginError && (
              <div className='bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5'>
                {loginError}
              </div>
            )}

            {/* Кнопка */}
            <button
              type='submit'
              disabled={loginLoading}
              className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-semibold hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed'
            >
              {loginLoading ? (
                <span>Вход…</span>
              ) : (
                <>
                  <LogIn className='w-4 h-4' />
                  Войти в KPI
                </>
              )}
            </button>
          </form>

          {/* Подсказка */}
          <div className='mt-4 pt-4 border-t border-slate-100'>
            <p className='text-xs text-slate-400 text-center'>
              Используйте учётные данные от KPI-системы.
              <br />
              Если у вас нет доступа — обратитесь к администратору.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
