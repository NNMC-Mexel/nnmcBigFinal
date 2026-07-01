import { useEffect, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Building2, Shield, Camera, Lock, Save, Eye, EyeOff, Briefcase, Trash2 } from 'lucide-react';
import { useAuthStore, useUserRole } from '../../store/authStore';
import client from '../../api/client';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { getMediaUrl } from '../../utils/media';

export default function ProfilePage() {
  const { i18n } = useTranslation();
  const { user, checkAuth } = useAuthStore();
  const { role, userDepartment } = useUserRole();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarUrl = getMediaUrl(user?.avatarUrl);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    position: user?.position || '',
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const isSyncedEmployeeProfile = user?.provider === 'keycloak' && /^\d{12}$/.test(String(user?.username || ''));

  useEffect(() => {
    if (isSyncedEmployeeProfile && isEditingProfile) {
      setIsEditingProfile(false);
    }
  }, [isSyncedEmployeeProfile, isEditingProfile]);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Новые пароли не совпадают');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('Пароль должен быть минимум 6 символов');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await client.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        password: passwordData.newPassword,
        passwordConfirmation: passwordData.confirmPassword,
      });
      const nextToken = response.data?.jwt;
      if (nextToken) {
        if (sessionStorage.getItem('jwt') && !localStorage.getItem('jwt')) {
          sessionStorage.setItem('jwt', nextToken);
        } else {
          localStorage.setItem('jwt', nextToken);
        }
        useAuthStore.setState({ token: nextToken });
      }
      setPasswordSuccess('Пароль изменён. На остальных устройствах выполнен выход из аккаунта.');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsEditingPassword(false);
    } catch (error: any) {
      setPasswordError(error.response?.data?.error?.message || 'Ошибка при смене пароля');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleProfileUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (isSyncedEmployeeProfile) {
      setIsEditingProfile(false);
      return;
    }
    setIsUpdatingProfile(true);
    try {
      await client.put(`/users/${user?.id}`, {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        position: profileData.position,
      });
      await checkAuth();
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setAvatarError('');
    if (!file.type.startsWith('image/')) {
      setAvatarError('Можно загрузить только изображение');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Фото должно быть не больше 5 МБ');
      e.target.value = '';
      return;
    }

    setIsUpdatingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      const uploadRes = await client.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = Array.isArray(uploadRes.data) ? uploadRes.data[0] : uploadRes.data;
      if (!uploaded?.id) throw new Error('Upload failed');

      await client.put(`/users/${user.id}`, { avatarFileId: uploaded.id });
      await checkAuth();
    } catch (error: any) {
      setAvatarError(error.response?.data?.error?.message || 'Не удалось загрузить фото');
    } finally {
      setIsUpdatingAvatar(false);
      e.target.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    if (!user?.id) return;
    setAvatarError('');
    setIsUpdatingAvatar(true);
    try {
      await client.put(`/users/${user.id}`, { avatarFileId: null });
      await checkAuth();
    } catch (error: any) {
      setAvatarError(error.response?.data?.error?.message || 'Не удалось удалить фото');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const getDepartmentName = () => {
    if (!userDepartment) return 'Не назначен';
    return i18n.language === 'kz' ? userDepartment.name_kz : userDepartment.name_ru;
  };

  const getRoleName = () => {
    if (role === 'superadmin') return 'СуперАдмин';
    return 'Сотрудник';
  };

  const getFullName = () => {
    if (user?.firstName || user?.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    const email = user?.email || '';
    const isTechnicalEmail = email.endsWith('@bpm.local') || email.endsWith('@employees.nnmc.kz');
    if (email && !isTechnicalEmail) return email;
    return 'Сотрудник';
  };

  const visibleEmail = user?.email && !user.email.endsWith('@bpm.local') && !user.email.endsWith('@employees.nnmc.kz')
    ? user.email
    : '';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-800">
          Личный кабинет
        </h1>
        <p className="text-slate-500 mt-1">Управление профилем и настройками</p>
      </div>

      {/* Profile Card */}
      <Card>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center text-white text-3xl font-bold overflow-hidden border border-slate-200">
              {avatarUrl ? (
                <img src={avatarUrl} alt={getFullName()} className="w-full h-full object-cover" />
              ) : (
                getFullName().charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              type="button"
              disabled={isUpdatingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-primary-600 transition-colors border border-slate-200 disabled:opacity-60"
              title="Загрузить фото"
            >
              <Camera className="w-4 h-4" />
            </button>
            {avatarUrl && (
              <button
                type="button"
                disabled={isUpdatingAvatar}
                onClick={handleAvatarRemove}
                className="absolute top-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-red-600 transition-colors border border-slate-200 disabled:opacity-60"
                title="Удалить фото"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {avatarError && (
              <p className="absolute left-0 top-full mt-2 w-40 text-xs text-red-600">
                {avatarError}
              </p>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            {isEditingProfile ? (
              <form onSubmit={handleProfileUpdate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Имя"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                    placeholder="Имя"
                  />
                  <Input
                    label="Фамилия"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    placeholder="Фамилия"
                  />
                </div>
                <Input
                  label="Должность"
                  value={profileData.position}
                  onChange={(e) => setProfileData({ ...profileData, position: e.target.value })}
                  placeholder="Например: врач-рентгенолог"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={isUpdatingProfile}>
                    Сохранить
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditingProfile(false)}>
                    Отмена
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-slate-800">{getFullName()}</h2>
                  {!isSyncedEmployeeProfile && (
                    <button
                      onClick={() => {
                        setProfileData({
                          firstName: user?.firstName || '',
                          lastName: user?.lastName || '',
                          position: user?.position || '',
                        });
                        setIsEditingProfile(true);
                      }}
                      className="text-primary-600 hover:text-primary-700 text-sm"
                    >
                      Редактировать
                    </button>
                  )}
                </div>
                {user?.position && (
                  <p className="text-slate-600 mb-3 flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    {user.position}
                  </p>
                )}
              </>
            )}

            <div className="flex flex-wrap gap-2">
              <Badge variant={role === 'superadmin' ? 'danger' : 'default'}>
                <Shield className="w-3 h-3 mr-1" />
                {getRoleName()}
              </Badge>
              {userDepartment && (
                <Badge variant={userDepartment.key === 'IT' ? 'it' : 'digital'}>
                  <Building2 className="w-3 h-3 mr-1" />
                  {getDepartmentName()}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Contact Info */}
      <Card>
        <h3 className="font-semibold text-slate-800 mb-4">Контактная информация</h3>
        <div className="space-y-4">
          {visibleEmail && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Mail className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium text-slate-800">{visibleEmail}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Отдел</p>
              <p className="font-medium text-slate-800">{getDepartmentName()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Должность</p>
              <p className="font-medium text-slate-800">{user?.position || 'Не указана'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Password Change */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Безопасность
          </h3>
          {!isEditingPassword && (
            <Button variant="secondary" size="sm" onClick={() => setIsEditingPassword(true)}>
              Изменить пароль
            </Button>
          )}
        </div>

        {passwordError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {passwordSuccess}
          </div>
        )}

        {isEditingPassword && (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="relative">
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                label="Текущий пароль"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                label="Новый пароль"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Input
              type="password"
              label="Подтвердите новый пароль"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              required
              minLength={6}
            />

            <div className="flex gap-2">
              <Button type="submit" loading={isUpdatingPassword} icon={<Save className="w-4 h-4" />}>
                Сохранить пароль
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditingPassword(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordError('');
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        )}

        {!isEditingPassword && (
          <p className="text-slate-500 text-sm">
            Для изменения пароля потребуется ввести текущий пароль.
          </p>
        )}
      </Card>
    </div>
  );
}
