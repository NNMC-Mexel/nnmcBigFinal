import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authApi } from '../../api/auth';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      await authApi.forgotPassword(email);
      setIsSuccess(true);
    } catch {
      setError('Failed to send reset link');
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
          Email отправлен
        </h2>
        <p className="text-slate-500 mb-6">
          Проверьте почту {email} для восстановления пароля.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Вернуться к входу
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
          {t('auth.forgotPassword')}
        </h2>
        <p className="text-slate-500 mt-1">
          Введите email для восстановления
        </p>
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

        <Button
          type="submit"
          className="w-full"
          loading={isLoading}
        >
          {t('auth.sendResetLink')}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Link>
      </p>
    </Card>
  );
}
