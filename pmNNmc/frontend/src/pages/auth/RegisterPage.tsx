import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import Card from '../../components/ui/Card';

export default function RegisterPage() {
  const { t } = useTranslation();

  return (
    <Card padding="lg" className="backdrop-blur-sm bg-white/90">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center">
          <UserPlus className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-display font-bold text-slate-800">
          {t('auth.register')}
        </h2>
        <p className="text-slate-500 mt-1">NNMC IT Project Board</p>
      </div>

      <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-700 text-sm text-center">
        Данная функция пока недоступна. Если хотите зарегистрироваться, обратитесь в IT-службу.
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          {t('auth.login')}
        </Link>
      </p>
    </Card>
  );
}
