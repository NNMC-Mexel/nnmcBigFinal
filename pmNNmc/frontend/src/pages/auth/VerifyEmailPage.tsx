import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { authApi } from '../../api/auth';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const confirmation = searchParams.get('confirmation');

  const [status, setStatus] = useState<'pending' | 'verifying' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (confirmation) {
      setStatus('verifying');
      authApi.emailConfirmation(confirmation)
        .then(() => setStatus('success'))
        .catch(() => setStatus('error'));
    }
  }, [confirmation]);

  // If we have a confirmation code, show verification status
  if (confirmation) {
    if (status === 'verifying') {
      return (
        <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
          <Loader text="Подтверждаем email..." />
        </Card>
      );
    }

    if (status === 'success') {
      return (
        <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-800 mb-2">
            Email подтверждён!
          </h2>
          <p className="text-slate-500 mb-6">
            Теперь вы можете войти в систему.
          </p>
          <Link
            to="/login"
            className="btn btn-primary"
          >
            Войти
          </Link>
        </Card>
      );
    }

    if (status === 'error') {
      return (
        <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-800 mb-2">
            Ошибка подтверждения
          </h2>
          <p className="text-slate-500 mb-6">
            Ссылка недействительна или устарела.
          </p>
          <Link
            to="/login"
            className="text-primary-600 hover:text-primary-700"
          >
            Вернуться к входу
          </Link>
        </Card>
      );
    }
  }

  // Default: show "check your email" message
  return (
    <Card padding="lg" className="backdrop-blur-sm bg-white/90 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary-100 flex items-center justify-center">
        <Mail className="w-7 h-7 text-primary-600" />
      </div>
      <h2 className="text-xl font-display font-bold text-slate-800 mb-2">
        {t('auth.verifyEmail')}
      </h2>
      <p className="text-slate-500 mb-6">
        {t('auth.verifyEmailText')}
      </p>
      <Link
        to="/login"
        className="text-primary-600 hover:text-primary-700"
      >
        Уже подтвердили? Войти
      </Link>
    </Card>
  );
}
