/**
 * SignDocPage
 *
 * Wrapper page for the embedded SignDoc (document signing) module.
 * Manages SignDoc-specific authentication (separate from pmNNmc auth):
 *
 * - Checks signdoc_token in localStorage on mount
 * - If valid → renders SignDocModule
 * - If not → shows a login form (styled in pmNNmc/Tailwind design)
 */

import { useState, useEffect } from 'react';
import { FileText, LogIn, Eye, EyeOff } from 'lucide-react';
// @ts-ignore — JS module, no types needed
import SignDocModule from '../../modules/signDoc/SignDocModule';
import { apiLogin, apiMe } from '../../modules/signDoc/api/signdocClient';

const SIGNDOC_TOKEN_KEY = 'signdoc_token';
const SIGNDOC_USER_KEY = 'signdoc_user';

interface SignDocUser {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  [key: string]: unknown;
}

export default function SignDocPage() {
  const [sdUser, setSdUser] = useState<SignDocUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem(SIGNDOC_TOKEN_KEY);
    if (!token) {
      setAuthChecked(true);
      return;
    }
    (apiMe as () => Promise<SignDocUser>)()
      .then((data) => {
        setSdUser(data);
        localStorage.setItem(SIGNDOC_USER_KEY, JSON.stringify(data));
      })
      .catch((err) => {
        const msg = String(err?.message || err || '').toLowerCase();
        const is401 = msg.includes('401') || msg.includes('unauthorized') || msg.includes('forbidden');
        if (is401) {
          localStorage.removeItem(SIGNDOC_TOKEN_KEY);
          localStorage.removeItem(SIGNDOC_USER_KEY);
        } else {
          // Network error — use cache
          const cached = localStorage.getItem(SIGNDOC_USER_KEY);
          if (cached) {
            try { setSdUser(JSON.parse(cached)); } catch { /* ignore */ }
          }
        }
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await (apiLogin as (l: string, p: string) => Promise<{ jwt?: string; user?: SignDocUser }>)(
        loginForm.login,
        loginForm.password
      );
      // apiLogin returns { jwt, user } — user info is in data.user
      const u = data.user;
      if (!u || !u.id) throw new Error('Не удалось получить данные пользователя');
      const user: SignDocUser = {
        id: u.id,
        username: u.username,
        email: u.email,
        fullName: u.fullName,
      };
      localStorage.setItem(SIGNDOC_USER_KEY, JSON.stringify(user));
      setSdUser(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      setLoginError(msg || 'Ошибка авторизации. Проверьте логин и пароль.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignDocLogout = () => {
    localStorage.removeItem(SIGNDOC_TOKEN_KEY);
    localStorage.removeItem(SIGNDOC_USER_KEY);
    setSdUser(null);
    setLoginForm({ login: '', password: '' });
    setLoginError('');
  };

  // Loading
  if (!authChecked) {
    return (
      <div className='flex items-center justify-center min-h-64'>
        <div className='text-slate-500 text-sm'>Загрузка модуля документооборота…</div>
      </div>
    );
  }

  // Authenticated — render module
  if (sdUser) {
    return <SignDocModule user={sdUser} onSignDocLogout={handleSignDocLogout} />;
  }

  // Login form
  return (
    <div className='flex items-center justify-center min-h-[60vh]'>
      <div className='w-full max-w-md'>
        {/* Header */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-medical-500 mb-4'>
            <FileText className='w-7 h-7 text-white' />
          </div>
          <h1 className='text-2xl font-bold text-slate-800 mb-1'>Документооборот</h1>
          <p className='text-slate-500 text-sm'>
            Войдите, используя учётные данные системы документооборота
          </p>
        </div>

        {/* Form card */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-lg p-6'>
          <form onSubmit={handleLogin} className='space-y-4'>
            {/* Login */}
            <div>
              <label className='block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5'>
                Логин
              </label>
              <input
                type='text'
                value={loginForm.login}
                onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value })}
                placeholder='Введите логин или email'
                required
                autoComplete='username'
                className='w-full px-3 py-2.5 rounded-lg border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-colors'
              />
            </div>

            {/* Password */}
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

            {/* Error */}
            {loginError && (
              <div className='bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5'>
                {loginError}
              </div>
            )}

            {/* Button */}
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
                  Войти в Документооборот
                </>
              )}
            </button>
          </form>

          {/* Hint */}
          <div className='mt-4 pt-4 border-t border-slate-100'>
            <p className='text-xs text-slate-400 text-center'>
              Используйте учётные данные от системы документооборота.
              <br />
              Если у вас нет доступа — обратитесь к администратору.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
