import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Mail, Lock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Загрузить сохранённый email при монтировании
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    
    try {
      await login(email, password, rememberMe);
      
      // Сохранить email если "Запомнить меня"
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      
      navigate('/app/dashboard');
    } catch {
      // Error is handled in store
    }
  };

  return (
    <Card padding="lg" className="backdrop-blur-sm bg-white/90">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center">
          <LogIn className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-display font-bold text-slate-800">
          {t('auth.login')}
        </h2>
        <p className="text-slate-500 mt-1">NNMC IT Project Board</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="pl-10"
          />
        </div>
        
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pl-10"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-600">Запомнить меня</span>
          </label>
          
          <Link
            to="/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={isLoading}
        >
          {t('auth.login')}
        </Button>
      </form>

      {import.meta.env.VITE_KEYCLOAK_ENABLED === 'true' && (
        <>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">или</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <a
            href={`${import.meta.env.VITE_API_URL}/api/connect/keycloak`}
            className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zm0 2.5a5 5 0 1 0 0 10A5 5 0 0 0 12 7z"/>
            </svg>
            Войти через Keycloak
          </a>
        </>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
          {t('auth.register')}
        </Link>
      </p>
    </Card>
  );
}
