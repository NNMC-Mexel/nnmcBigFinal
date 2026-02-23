import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Plus,
  Search,
  Filter,
  Shield,
  Building2,
  Edit,
  Key,
  Trash2,
  UserCheck,
  UserX,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { adminUsersApi, AdminUser, Role } from '../../api/adminUsers';
import { projectsApi } from '../../api/projects';
import type { Project } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Loader from '../../components/ui/Loader';

export default function AdminPanelPage() {
  const { t, i18n } = useTranslation();
  const { departments, fetchDepartments } = useProjectStore();
  
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [isDeletedProjectsLoading, setIsDeletedProjectsLoading] = useState(false);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  const [selectedDeletedProject, setSelectedDeletedProject] = useState<Project | null>(null);
  
  // Фильтры
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [blockedFilter, setBlockedFilter] = useState('');
  
  // Модальные окна
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Форма создания/редактирования
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 1,
    department: null as number | null,
    blocked: false,
    generatePasswordAuto: true,
  });

  useEffect(() => {
    fetchDepartments();
    loadRoles();
    loadUsers();
    loadDeletedProjects();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, deptFilter, roleFilter, blockedFilter]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {};
      if (searchTerm) params.search = searchTerm;
      if (deptFilter) params.department = deptFilter;
      if (roleFilter) params.role = roleFilter;
      if (blockedFilter) params.blocked = blockedFilter;
      
      const data = await adminUsersApi.getAll(params);
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDeletedProjects = async () => {
    setIsDeletedProjectsLoading(true);
    try {
      const data = await projectsApi.getAll({ status: 'DELETED' });
      setDeletedProjects(data);
    } catch (error) {
      console.error('Failed to load deleted projects:', error);
    } finally {
      setIsDeletedProjectsLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const data = await adminUsersApi.getRoles();
      setRoles(data);
    } catch (error) {
      console.error('Failed to load roles:', error);
    }
  };

  const handleCreateUser = async () => {
    try {
      const result = await adminUsersApi.create({
        email: formData.email,
        username: formData.username,
        firstName: formData.firstName,
        lastName: formData.lastName,
        password: formData.generatePasswordAuto ? undefined : formData.password,
        role: formData.role,
        department: formData.department,
        blocked: formData.blocked,
        generatePasswordAuto: formData.generatePasswordAuto,
      });
      
      if (result.generatedPassword) {
        setGeneratedPassword(result.generatedPassword);
        setShowPassword(true);
      }
      
      setShowCreateModal(false);
      resetForm();
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка создания пользователя');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    try {
      await adminUsersApi.update(selectedUser.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        department: formData.department,
        blocked: formData.blocked,
      });
      
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка обновления');
    }
  };

  const handleResetPassword = async (generateNew: boolean, newPassword?: string) => {
    if (!selectedUser) return;
    
    try {
      const result = await adminUsersApi.resetPassword(selectedUser.id, {
        generateNew,
        newPassword: generateNew ? undefined : newPassword,
      });
      
      setGeneratedPassword(result.newPassword);
      setShowPassword(true);
      setShowPasswordModal(false);
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка сброса пароля');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      await adminUsersApi.delete(selectedUser.id);
      setShowDeleteConfirm(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка удаления');
    }
  };

  const openDeleteProjectConfirm = (project: Project) => {
    setSelectedDeletedProject(project);
    setShowDeleteProjectConfirm(true);
  };

  const handleRestoreDeletedProject = async (project: Project) => {
    try {
      await projectsApi.restore(project.documentId);
      loadDeletedProjects();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка восстановления проекта');
    }
  };

  const handleDeleteProjectPermanently = async () => {
    if (!selectedDeletedProject) return;
    
    try {
      await projectsApi.delete(selectedDeletedProject.documentId);
      setShowDeleteProjectConfirm(false);
      setSelectedDeletedProject(null);
      loadDeletedProjects();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка удаления проекта');
    }
  };

  const handleToggleBlocked = async (user: AdminUser) => {
    try {
      await adminUsersApi.update(user.id, { blocked: !user.blocked });
      loadUsers();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      username: '',
      firstName: '',
      lastName: '',
      password: '',
      role: 1,
      department: null,
      blocked: false,
      generatePasswordAuto: true,
    });
  };

  const openEditModal = (user: AdminUser) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      role: user.role?.id || 1,
      department: user.department?.id || null,
      blocked: user.blocked,
      generatePasswordAuto: true,
    });
    setShowEditModal(true);
  };

  const openPasswordModal = (user: AdminUser) => {
    setSelectedUser(user);
    setShowPasswordModal(true);
  };

  const openDeleteConfirm = (user: AdminUser) => {
    setSelectedUser(user);
    setShowDeleteConfirm(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getDepartmentName = (dept?: AdminUser['department']) => {
    if (!dept) return '—';
    return i18n.language === 'kz' ? dept.name_kz : dept.name_ru;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const departmentOptions = [
    { value: '', label: 'Все отделы' },
    ...departments.map((d) => ({
      value: d.key,
      label: i18n.language === 'kz' ? d.name_kz : d.name_ru,
    })),
  ];

  const roleOptions = [
    { value: '', label: 'Все роли' },
    ...roles.map((r) => ({
      value: String(r.id),
      label: r.name,
    })),
  ];

  const blockedOptions = [
    { value: '', label: 'Все' },
    { value: 'false', label: 'Активные' },
    { value: 'true', label: 'Заблокированные' },
  ];

  const departmentSelectOptions = [
    { value: '', label: 'Без отдела' },
    ...departments.map((d) => ({
      value: String(d.id),
      label: i18n.language === 'kz' ? d.name_kz : d.name_ru,
    })),
  ];

  const roleSelectOptions = roles.map((r) => ({
    value: String(r.id),
    label: r.name,
  }));

  if (isLoading && users.length === 0) {
    return <Loader text="Загрузка пользователей..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Shield className="w-7 h-7 text-red-500" />
            OnlyAdmin
          </h1>
          <p className="text-slate-500 mt-1">
            Управление пользователями системы • {users.length} аккаунт(ов)
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateModal(true); }} icon={<Plus className="w-4 h-4" />}>
          Создать аккаунт
        </Button>
      </div>

      {/* Показ сгенерированного пароля */}
      {generatedPassword && (
        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Новый пароль:</p>
                <p className="font-mono text-lg text-green-700 flex items-center gap-2">
                  {showPassword ? generatedPassword : '••••••••••••'}
                  <button onClick={() => setShowPassword(!showPassword)} className="text-green-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => copyToClipboard(generatedPassword)} icon={<Copy className="w-4 h-4" />}>
                Скопировать
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGeneratedPassword(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Поиск по имени, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <div className="w-40">
            <Select
              options={departmentOptions}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            />
          </div>
          
          <div className="w-40">
            <Select
              options={roleOptions}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
          </div>
          
          <div className="w-40">
            <Select
              options={blockedOptions}
              value={blockedFilter}
              onChange={(e) => setBlockedFilter(e.target.value)}
            />
          </div>
          
          <Button variant="ghost" onClick={loadUsers} icon={<RefreshCw className="w-4 h-4" />}>
            Обновить
          </Button>
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                <th className="px-4 py-3 font-medium">Отдел</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Регистрация</th>
                <th className="px-4 py-3 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center text-white font-bold">
                          {(user.firstName || user.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.username}
                          </p>
                          <p className="text-sm text-slate-500">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          user.role?.name?.toLowerCase() === 'admin' ? 'danger' :
                          user.role?.name?.toLowerCase() === 'lead' ? 'warning' : 'default'
                        }
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role?.name || 'Без роли'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {user.department ? (
                        <Badge variant={user.department.key === 'IT' ? 'it' : 'digital'}>
                          <Building2 className="w-3 h-3 mr-1" />
                          {getDepartmentName(user.department)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleBlocked(user)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                          user.blocked
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {user.blocked ? (
                          <>
                            <UserX className="w-3 h-3" />
                            Заблокирован
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3 h-3" />
                            Активен
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Редактировать"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPasswordModal(user)}
                          className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Сбросить пароль"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteConfirm(user)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deleted Projects */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">{t('project.deletedProjects')}</h3>
          <Button variant="ghost" onClick={loadDeletedProjects} icon={<RefreshCw className="w-4 h-4" />}>
            Обновить
          </Button>
        </div>
        {isDeletedProjectsLoading && deletedProjects.length === 0 ? (
          <Loader text="Загрузка удаленных проектов..." />
        ) : deletedProjects.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            Удаленных проектов нет
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Проект</th>
                  <th className="px-4 py-3 font-medium">Отдел</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Удален</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {deletedProjects.map((project) => (
                  <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {project.title}
                    </td>
                    <td className="px-4 py-3">
                      {project.department ? (
                        <Badge variant={project.department.key === 'IT' ? 'it' : 'digital'}>
                          {getDepartmentName(project.department)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="danger">{t('status.DELETED')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {project.updatedAt ? formatDate(project.updatedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRestoreDeletedProject(project)}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title={t('project.restoreProject')}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteProjectConfirm(project)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('project.deleteProjectPermanently')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Создать аккаунт"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email *"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Input
              label="Username *"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Имя"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
            <Input
              label="Фамилия"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Роль"
              options={roleSelectOptions}
              value={String(formData.role)}
              onChange={(e) => setFormData({ ...formData, role: parseInt(e.target.value) })}
            />
            <Select
              label="Отдел"
              options={departmentSelectOptions}
              value={formData.department ? String(formData.department) : ''}
              onChange={(e) => setFormData({ ...formData, department: e.target.value ? parseInt(e.target.value) : null })}
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.generatePasswordAuto}
                onChange={(e) => setFormData({ ...formData, generatePasswordAuto: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700">Сгенерировать пароль автоматически</span>
            </label>
            
            {!formData.generatePasswordAuto && (
              <Input
                label="Пароль"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                minLength={6}
              />
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateUser}>
              Создать
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedUser(null); }}
        title={`Редактировать: ${selectedUser?.email}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Имя"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
            <Input
              label="Фамилия"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Роль"
              options={roleSelectOptions}
              value={String(formData.role)}
              onChange={(e) => setFormData({ ...formData, role: parseInt(e.target.value) })}
            />
            <Select
              label="Отдел"
              options={departmentSelectOptions}
              value={formData.department ? String(formData.department) : ''}
              onChange={(e) => setFormData({ ...formData, department: e.target.value ? parseInt(e.target.value) : null })}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.blocked}
              onChange={(e) => setFormData({ ...formData, blocked: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-slate-700">Заблокировать аккаунт</span>
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setShowEditModal(false); setSelectedUser(null); }}>
              Отмена
            </Button>
            <Button onClick={handleUpdateUser}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => { setShowPasswordModal(false); setSelectedUser(null); }}
        title={`Сброс пароля: ${selectedUser?.email}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            Выберите способ сброса пароля для пользователя <strong>{selectedUser?.username}</strong>
          </p>
          
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => handleResetPassword(true)}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Сгенерировать новый пароль
            </Button>
            
            <div className="text-center text-sm text-slate-400">или</div>
            
            <Input
              label="Задать пароль вручную"
              type="password"
              id="manualPassword"
              minLength={6}
              placeholder="Минимум 6 символов"
            />
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const input = document.getElementById('manualPassword') as HTMLInputElement;
                if (input.value.length >= 6) {
                  handleResetPassword(false, input.value);
                } else {
                  alert('Пароль должен быть минимум 6 символов');
                }
              }}
              icon={<Key className="w-4 h-4" />}
            >
              Установить пароль
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}
        title="Удалить пользователя?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            Вы уверены, что хотите удалить аккаунт <strong>{selectedUser?.email}</strong>?
            Это действие нельзя отменить.
          </p>
          
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}>
              Отмена
            </Button>
            <Button variant="primary" className="!bg-red-600 hover:!bg-red-700" onClick={handleDeleteUser}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Project Confirmation Modal */}
      <Modal
        isOpen={showDeleteProjectConfirm}
        onClose={() => { setShowDeleteProjectConfirm(false); setSelectedDeletedProject(null); }}
        title={t('project.deleteProjectPermanently')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            {t('project.deleteProjectPermanentlyConfirm')}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowDeleteProjectConfirm(false); setSelectedDeletedProject(null); }}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteProjectPermanently}>
              {t('project.deleteProjectPermanently')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
