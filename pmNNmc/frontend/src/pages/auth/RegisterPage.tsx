import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, Mail, Lock, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [validationError, setValidationError] = useState('');

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    clearError();
    setValidationError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    
    try {
      await register({
        username: formData.email.split('@')[0],
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });
      navigate('/verify-email');
    } catch {
      // Error is handled in store
    }
  };

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

      {(error || validationError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error || validationError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder={t('auth.firstName')}
              value={formData.firstName}
              onChange={handleChange('firstName')}
              className="pl-10"
            />
          </div>
          <Input
            type="text"
            placeholder={t('auth.lastName')}
            value={formData.lastName}
            onChange={handleChange('lastName')}
          />
        </div>

        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="email"
            placeholder={t('auth.email')}
            value={formData.email}
            onChange={handleChange('email')}
            required
            className="pl-10"
          />
        </div>
        
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="password"
            placeholder={t('auth.password')}
            value={formData.password}
            onChange={handleChange('password')}
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
            value={formData.confirmPassword}
            onChange={handleChange('confirmPassword')}
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
          {t('auth.register')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          {t('auth.login')}
        </Link>
      </p>
    </Card>
  );
}
