import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Lock, CheckCircle } from 'lucide-react';
import { authApi } from '../../api/auth';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      await authApi.resetPassword(code, password, confirmPassword);
      setIsSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      setError('Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-xl font-display font-bold text-slate-800 mb-2">
          Пароль изменён
        </h2>
        <p className="text-slate-500 mb-6">
          Перенаправляем на страницу входа...
        </p>
      </Card>
    );
  }

  if (!code) {
    return (
      <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
        <h2 className="text-xl font-display font-bold text-slate-800 mb-2">
          Неверная ссылка
        </h2>
        <p className="text-slate-500 mb-6">
          Ссылка для сброса пароля недействительна.
        </p>
        <Link
          to="/forgot-password"
          className="text-primary-600 hover:text-primary-700"
        >
          Запросить новую ссылку
        </Link>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="backdrop-blur-sm bg-white/90">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center">
          <KeyRound className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-display font-bold text-slate-800">
          {t('auth.resetPassword')}
        </h2>
        <p className="text-slate-500 mt-1">Введите новый пароль</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="pl-10"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="password"
            placeholder={t('auth.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="pl-10"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={isLoading}
        >
          {t('auth.resetPassword')}
        </Button>
      </form>
    </Card>
  );
}
