import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Plus,
  Search,
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
  Check,
  Save,
} from 'lucide-react';
import { adminUsersApi, AdminUser } from '../../api/adminUsers';
import { projectsApi } from '../../api/projects';
import type { Project, Department } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Loader from '../../components/ui/Loader';

// Permission flag keys on Department
const PERMISSION_FLAGS = [
  { key: 'canViewNews', label: 'Новости' },
  { key: 'canViewDashboard', label: 'Дашборд' },
  { key: 'canViewBoard', label: 'Канбан' },
  { key: 'canViewTable', label: 'Таблица' },
  { key: 'canViewHelpdesk', label: 'Helpdesk' },
  { key: 'canViewKpiIt', label: 'KPI IT' },
  { key: 'canViewKpiMedical', label: 'KPI Мед' },
  { key: 'canViewKpiEngineering', label: 'KPI Инж' },
  { key: 'canViewKpiTimesheet', label: 'KPI Табель' },
  { key: 'canAccessConf', label: 'Конф-залы' },
  { key: 'canAccessJournal', label: 'Журнал' },
  { key: 'canAccessSigndoc', label: 'Документы' },
  { key: 'canManageNews', label: 'Упр. новостями' },
  { key: 'canDeleteProject', label: 'Удаление проект.' },
  { key: 'canDragProjects', label: 'Перетаскивание' },
  { key: 'canManageProjectAssignments', label: 'Назначения' },
  { key: 'canManageTickets', label: 'Упр. заявками' },
  { key: 'canViewActivityLog', label: 'История' },
] as const;

type PermissionKey = typeof PERMISSION_FLAGS[number]['key'];
type Tab = 'departments' | 'permissions' | 'users' | 'deleted';

export default function AdminPanelPage() {
  const { t, i18n } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [isDeletedProjectsLoading, setIsDeletedProjectsLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [blockedFilter, setBlockedFilter] = useState('');

  // Modals
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateDeptModal, setShowCreateDeptModal] = useState(false);
  const [showEditDeptModal, setShowEditDeptModal] = useState(false);
  const [showDeleteDeptConfirm, setShowDeleteDeptConfirm] = useState(false);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  const [selectedDeletedProject, setSelectedDeletedProject] = useState<Project | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Permission matrix state
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [matrixData, setMatrixData] = useState<Record<number, Record<string, boolean>>>({});
  const [matrixSaving, setMatrixSaving] = useState(false);

  // User form
  const [userForm, setUserForm] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    department: null as number | null,
    blocked: false,
    generatePasswordAuto: true,
    createInKeycloak: true,
    isSuperAdmin: false,
    kpiAllDepartments: false,
    kpiAllowedDepartments: [] as string[],
  });

  // KPI access state for the user being edited
  const [kpiAccessUserId, setKpiAccessUserId] = useState<number | null>(null);
  const [kpiAccessLoading, setKpiAccessLoading] = useState(false);

  // Department form
  const [deptForm, setDeptForm] = useState({
    key: '',
    name_ru: '',
    name_kz: '',
    description: '',
  });

  // KPI departments (from server-kpi — different set than pm departments)
  const [kpiDepartments, setKpiDepartments] = useState<string[]>([]);

  useEffect(() => {
    loadDepartments();
    loadUsers();
    loadDeletedProjects();
    loadKpiDepartments();
  }, []);

  const loadKpiDepartments = async () => {
    try {
      const base = `${window.location.protocol}//${window.location.hostname}:12011/api`;
      const token = localStorage.getItem('kpi_token');
      const res = await fetch(`${base}/kpi-list`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        console.warn('loadKpiDepartments: HTTP', res.status);
        return;
      }
      const json: any = await res.json();
      const items: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
        ? json.data
        : [];
      const names = Array.from(
        new Set(items.map((x: any) => String(x?.department || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, 'ru'));
      setKpiDepartments(names);
    } catch (err) {
      console.warn('loadKpiDepartments failed:', err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, deptFilter, blockedFilter]);

  // ─── Loaders ────────────────────────────────────────────

  const loadDepartments = async () => {
    try {
      const data = await adminUsersApi.getDepartments();
      setDepartments(data);
      // Init matrix
      const matrix: Record<number, Record<string, boolean>> = {};
      for (const dept of data) {
        matrix[dept.id] = {};
        for (const { key } of PERMISSION_FLAGS) {
          matrix[dept.id][key] = (dept as any)[key] === true;
        }
      }
      setMatrixData(matrix);
      setMatrixDirty(false);
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {};
      if (searchTerm) params.search = searchTerm;
      if (deptFilter) params.department = deptFilter;
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

  // ─── User CRUD ──────────────────────────────────────────

  const resetUserForm = () => {
    setUserForm({
      email: '', username: '', firstName: '', lastName: '', password: '',
      department: null, blocked: false, generatePasswordAuto: true, createInKeycloak: true, isSuperAdmin: false,
      kpiAllDepartments: false, kpiAllowedDepartments: [],
    });
    setKpiAccessUserId(null);
  };

  const handleCreateUser = async () => {
    try {
      let result: { generatedPassword?: string | null };

      if (userForm.createInKeycloak) {
        result = await adminUsersApi.createKeycloakUser({
          email: userForm.email,
          username: userForm.username,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          password: userForm.generatePasswordAuto ? undefined : userForm.password,
          department: userForm.department,
          isSuperAdmin: userForm.isSuperAdmin,
        });
      } else {
        result = await adminUsersApi.create({
          email: userForm.email,
          username: userForm.username,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          password: userForm.generatePasswordAuto ? undefined : userForm.password,
          department: userForm.department,
          blocked: userForm.blocked,
          generatePasswordAuto: userForm.generatePasswordAuto,
          isSuperAdmin: userForm.isSuperAdmin,
        });
      }

      if (result.generatedPassword) {
        setGeneratedPassword(result.generatedPassword);
        setShowPassword(true);
      }

      setShowCreateUserModal(false);
      resetUserForm();
      loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка создания пользователя');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      await adminUsersApi.update(selectedUser.id, {
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        department: userForm.department,
        blocked: userForm.blocked,
        isSuperAdmin: userForm.isSuperAdmin,
      });

      // Save KPI access via server-kpi department-access endpoint
      if (kpiAccessUserId != null) {
        const base = `${window.location.protocol}//${window.location.hostname}:12011/api`;
        const token = localStorage.getItem('kpi_token');
        // If "all departments" checked — send empty array (KPI treats admin-level / empty as unrestricted;
        // but for non-admin user empty means none. We send all known KPI dept names when "all" is on.)
        const departments = userForm.kpiAllDepartments ? kpiDepartments : userForm.kpiAllowedDepartments;
        try {
          await fetch(`${base}/department-access/update`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ userId: kpiAccessUserId, departments }),
          });
        } catch (err) {
          console.warn('KPI access update failed:', err);
        }
      }

      setShowEditUserModal(false);
      setSelectedUser(null);
      resetUserForm();
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

  const handleToggleBlocked = async (user: AdminUser) => {
    try {
      await adminUsersApi.update(user.id, { blocked: !user.blocked });
      loadUsers();
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  const openEditUserModal = async (user: AdminUser) => {
    setSelectedUser(user);
    setUserForm({
      email: user.email,
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      department: user.department?.id || null,
      blocked: user.blocked,
      generatePasswordAuto: true,
      createInKeycloak: true,
      isSuperAdmin: user.isSuperAdmin === true,
      kpiAllDepartments: false,
      kpiAllowedDepartments: [],
    });
    setKpiAccessUserId(null);
    setShowEditUserModal(true);

    // Fetch KPI access for this user (match by email)
    setKpiAccessLoading(true);
    try {
      const base = `${window.location.protocol}//${window.location.hostname}:12011/api`;
      const token = localStorage.getItem('kpi_token');
      const res = await fetch(`${base}/department-access/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json: any = await res.json();
        const items: any[] = Array.isArray(json?.items) ? json.items : [];
        const match = items.find(
          (u) =>
            String(u.email || '').toLowerCase() === String(user.email || '').toLowerCase() ||
            String(u.username || '').toLowerCase() === String(user.username || '').toLowerCase()
        );
        if (match) {
          const allowed: string[] = Array.isArray(match.allowedDepartments) ? match.allowedDepartments : [];
          setKpiAccessUserId(match.id);
          // "all departments" = list covers all known KPI depts
          const allOn = kpiDepartments.length > 0 && kpiDepartments.every((d) => allowed.includes(d));
          setUserForm((prev) => ({
            ...prev,
            kpiAllDepartments: allOn,
            kpiAllowedDepartments: allOn ? [] : allowed,
          }));
        }
      }
    } catch (err) {
      console.warn('loadKpiAccess failed:', err);
    } finally {
      setKpiAccessLoading(false);
    }
  };

  // ─── Department CRUD ────────────────────────────────────

  const resetDeptForm = () => {
    setDeptForm({ key: '', name_ru: '', name_kz: '', description: '' });
  };

  const handleCreateDept = async () => {
    try {
      await adminUsersApi.createDepartment({
        key: deptForm.key,
        name_ru: deptForm.name_ru,
        name_kz: deptForm.name_kz,
        description: deptForm.description || undefined,
      });
      setShowCreateDeptModal(false);
      resetDeptForm();
      loadDepartments();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка создания отдела');
    }
  };

  const handleUpdateDept = async () => {
    if (!selectedDept) return;
    try {
      await adminUsersApi.updateDepartment(selectedDept.id, {
        key: deptForm.key,
        name_ru: deptForm.name_ru,
        name_kz: deptForm.name_kz,
        description: deptForm.description || undefined,
      } as any);
      setShowEditDeptModal(false);
      setSelectedDept(null);
      resetDeptForm();
      loadDepartments();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка обновления отдела');
    }
  };

  const handleDeleteDept = async () => {
    if (!selectedDept) return;
    try {
      await adminUsersApi.deleteDepartment(selectedDept.id);
      setShowDeleteDeptConfirm(false);
      setSelectedDept(null);
      loadDepartments();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка удаления отдела');
    }
  };

  // ─── Permission Matrix ──────────────────────────────────

  const toggleMatrixFlag = (deptId: number, flag: string) => {
    setMatrixData((prev) => ({
      ...prev,
      [deptId]: {
        ...prev[deptId],
        [flag]: !prev[deptId]?.[flag],
      },
    }));
    setMatrixDirty(true);
  };

  const saveMatrix = async () => {
    setMatrixSaving(true);
    try {
      const deptUpdates = Object.entries(matrixData).map(([id, flags]) => ({
        id: Number(id),
        ...flags,
      }));
      await adminUsersApi.updateDepartmentPermissions(deptUpdates as any);
      setMatrixDirty(false);
      loadDepartments();
    } catch (error: any) {
      alert(error.response?.data?.error?.message || 'Ошибка сохранения прав');
    } finally {
      setMatrixSaving(false);
    }
  };

  // ─── Deleted Projects ───────────────────────────────────

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

  // ─── Helpers ────────────────────────────────────────────

  const getDeptName = (dept?: { name_ru: string; name_kz: string }) => {
    if (!dept) return '—';
    return i18n.language === 'kz' ? dept.name_kz : dept.name_ru;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const departmentFilterOptions = [
    { value: '', label: 'Все отделы' },
    ...departments.map((d) => ({ value: String(d.id), label: getDeptName(d) })),
  ];

  const departmentSelectOptions = [
    { value: '', label: 'Без отдела' },
    ...departments.map((d) => ({ value: String(d.id), label: getDeptName(d) })),
  ];

  const blockedOptions = [
    { value: '', label: 'Все' },
    { value: 'false', label: 'Активные' },
    { value: 'true', label: 'Заблокированные' },
  ];

  // ─── Tab bar ────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'departments', label: 'Отделы' },
    { key: 'permissions', label: 'Матрица прав' },
    { key: 'users', label: 'Пользователи' },
    { key: 'deleted', label: 'Удалённые проекты' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3">
          <Shield className="w-7 h-7 text-red-500" />
          Админ-панель
        </h1>
        <p className="text-slate-500 mt-1">Управление отделами, правами и пользователями</p>
      </div>

      {/* Generated password banner */}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Departments ──────────────────────────────── */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetDeptForm(); setShowCreateDeptModal(true); }} icon={<Plus className="w-4 h-4" />}>
              Создать отдел
            </Button>
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 font-medium">Ключ</th>
                    <th className="px-4 py-3 font-medium">Название (RU)</th>
                    <th className="px-4 py-3 font-medium">Название (KZ)</th>
                    <th className="px-4 py-3 font-medium">Описание</th>
                    <th className="px-4 py-3 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      Отделы не найдены
                    </td></tr>
                  ) : departments.map((dept) => (
                    <tr key={dept.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-slate-700">{dept.key}</td>
                      <td className="px-4 py-3 text-slate-800">{dept.name_ru}</td>
                      <td className="px-4 py-3 text-slate-800">{dept.name_kz}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{dept.description || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedDept(dept);
                              setDeptForm({ key: dept.key, name_ru: dept.name_ru, name_kz: dept.name_kz, description: dept.description || '' });
                              setShowEditDeptModal(true);
                            }}
                            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Редактировать"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setSelectedDept(dept); setShowDeleteDeptConfirm(true); }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Удалить"
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
          </Card>
        </div>
      )}

      {/* ─── Tab: Permission Matrix ────────────────────────── */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Отметьте доступные разделы для каждого отдела</p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={loadDepartments}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Обновить
              </Button>
              <Button
                onClick={saveMatrix}
                disabled={!matrixDirty || matrixSaving}
                icon={matrixSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              >
                {matrixSaving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="px-3 py-2 font-medium sticky left-0 bg-white z-10 min-w-[140px]">Отдел</th>
                    {PERMISSION_FLAGS.map(({ key, label }) => (
                      <th key={key} className="px-1.5 py-2 font-medium text-center whitespace-nowrap" style={{ minWidth: 70 }}>
                        <span className="text-[10px] leading-tight block">{label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white z-10">
                        {getDeptName(dept)}
                      </td>
                      {PERMISSION_FLAGS.map(({ key }) => (
                        <td key={key} className="px-1.5 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={matrixData[dept.id]?.[key] === true}
                            onChange={() => toggleMatrixFlag(dept.id, key)}
                            className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Tab: Users ────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-slate-500">{users.length} аккаунт(ов)</p>
            <Button onClick={() => { resetUserForm(); setShowCreateUserModal(true); }} icon={<Plus className="w-4 h-4" />}>
              Создать аккаунт
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Поиск по имени, email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
              </div>
              <div className="w-40">
                <Select options={departmentFilterOptions} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} />
              </div>
              <div className="w-40">
                <Select options={blockedOptions} value={blockedFilter} onChange={(e) => setBlockedFilter(e.target.value)} />
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
                    <th className="px-4 py-3 font-medium">Отдел</th>
                    <th className="px-4 py-3 font-medium">SuperAdmin</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium">Регистрация</th>
                    <th className="px-4 py-3 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      Пользователи не найдены
                    </td></tr>
                  ) : users.map((user) => (
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
                        {user.department ? (
                          <Badge variant="default">
                            <Building2 className="w-3 h-3 mr-1" />
                            {getDeptName(user.department)}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.isSuperAdmin ? (
                          <Badge variant="danger">
                            <Shield className="w-3 h-3 mr-1" />
                            SA
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleBlocked(user)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                            user.blocked ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {user.blocked ? <><UserX className="w-3 h-3" /> Заблокирован</> : <><UserCheck className="w-3 h-3" /> Активен</>}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditUserModal(user)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Редактировать">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setSelectedUser(user); setShowPasswordModal(true); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Сбросить пароль">
                            <Key className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Удалить">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ─── Tab: Deleted Projects ─────────────────────────── */}
      {activeTab === 'deleted' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">{t('project.deletedProjects')}</h3>
            <Button variant="ghost" onClick={loadDeletedProjects} icon={<RefreshCw className="w-4 h-4" />}>Обновить</Button>
          </div>
          {isDeletedProjectsLoading && deletedProjects.length === 0 ? (
            <Loader text="Загрузка удаленных проектов..." />
          ) : deletedProjects.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Удаленных проектов нет</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 font-medium">Проект</th>
                    <th className="px-4 py-3 font-medium">Отдел</th>
                    <th className="px-4 py-3 font-medium">Удален</th>
                    <th className="px-4 py-3 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedProjects.map((project) => (
                    <tr key={project.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{project.title}</td>
                      <td className="px-4 py-3">
                        {project.department ? <Badge variant="default">{getDeptName(project.department)}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{project.updatedAt ? formatDate(project.updatedAt) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleRestoreDeletedProject(project)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title={t('project.restoreProject')}>
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setSelectedDeletedProject(project); setShowDeleteProjectConfirm(true); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('project.deleteProjectPermanently')}>
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
      )}

      {/* ═══ MODALS ═══════════════════════════════════════════ */}

      {/* Create User Modal */}
      <Modal isOpen={showCreateUserModal} onClose={() => setShowCreateUserModal(false)} title="Создать аккаунт" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email *" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
            <Input label="Username *" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Имя" value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
            <Input label="Фамилия" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
          </div>
          <Select label="Отдел" options={departmentSelectOptions} value={userForm.department ? String(userForm.department) : ''} onChange={(e) => setUserForm({ ...userForm, department: e.target.value ? parseInt(e.target.value) : null })} />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={userForm.isSuperAdmin} onChange={(e) => setUserForm({ ...userForm, isSuperAdmin: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span className="text-sm text-slate-700">SuperAdmin (полный доступ + админ-панель)</span>
          </label>

          <div className="p-3 bg-slate-50 rounded-lg space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={userForm.createInKeycloak} onChange={(e) => setUserForm({ ...userForm, createInKeycloak: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-slate-700">Создать в Keycloak (SSO)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={userForm.generatePasswordAuto} onChange={(e) => setUserForm({ ...userForm, generatePasswordAuto: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-slate-700">Сгенерировать пароль автоматически</span>
            </label>
            {!userForm.generatePasswordAuto && (
              <Input label="Пароль" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} minLength={6} />
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateUserModal(false)}>Отмена</Button>
            <Button onClick={handleCreateUser}>Создать</Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={showEditUserModal} onClose={() => { setShowEditUserModal(false); setSelectedUser(null); }} title={`Редактировать: ${selectedUser?.email}`} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Имя" value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
            <Input label="Фамилия" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
          </div>
          <Select label="Отдел" options={departmentSelectOptions} value={userForm.department ? String(userForm.department) : ''} onChange={(e) => setUserForm({ ...userForm, department: e.target.value ? parseInt(e.target.value) : null })} />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={userForm.isSuperAdmin} onChange={(e) => setUserForm({ ...userForm, isSuperAdmin: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span className="text-sm text-slate-700">SuperAdmin (полный доступ + админ-панель)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={userForm.blocked} onChange={(e) => setUserForm({ ...userForm, blocked: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span className="text-sm text-slate-700">Заблокировать аккаунт</span>
          </label>

          <div className="border-t border-slate-200 pt-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">Доступ к отделам KPI</div>
            {kpiAccessLoading && (
              <div className="text-xs text-slate-400 mb-2">Загрузка…</div>
            )}
            {!kpiAccessLoading && kpiAccessUserId == null && (
              <div className="text-xs text-amber-600 mb-2">
                Пользователь не найден в server-kpi (проверьте синхронизацию или email).
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                disabled={kpiAccessUserId == null}
                checked={userForm.kpiAllDepartments}
                onChange={(e) => setUserForm({ ...userForm, kpiAllDepartments: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700">Все отделы</span>
            </label>
            {!userForm.kpiAllDepartments && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded p-2 space-y-1">
                {kpiDepartments.length === 0 && (
                  <div className="text-xs text-slate-400 p-2">Список KPI отделов пуст</div>
                )}
                {kpiDepartments.map((name) => {
                  const checked = userForm.kpiAllowedDepartments.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        disabled={kpiAccessUserId == null}
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...userForm.kpiAllowedDepartments, name]
                            : userForm.kpiAllowedDepartments.filter((x) => x !== name);
                          setUserForm({ ...userForm, kpiAllowedDepartments: next });
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setShowEditUserModal(false); setSelectedUser(null); }}>Отмена</Button>
            <Button onClick={handleUpdateUser}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Password Reset Modal */}
      <Modal isOpen={showPasswordModal} onClose={() => { setShowPasswordModal(false); setSelectedUser(null); }} title={`Сброс пароля: ${selectedUser?.email}`} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">Выберите способ сброса пароля для <strong>{selectedUser?.username}</strong></p>
          <div className="space-y-3">
            <Button className="w-full" onClick={() => handleResetPassword(true)} icon={<RefreshCw className="w-4 h-4" />}>Сгенерировать новый пароль</Button>
            <div className="text-center text-sm text-slate-400">или</div>
            <Input label="Задать пароль вручную" type="password" id="manualPassword" minLength={6} placeholder="Минимум 6 символов" />
            <Button variant="secondary" className="w-full" onClick={() => {
              const input = document.getElementById('manualPassword') as HTMLInputElement;
              if (input.value.length >= 6) handleResetPassword(false, input.value);
              else alert('Пароль должен быть минимум 6 символов');
            }} icon={<Key className="w-4 h-4" />}>Установить пароль</Button>
          </div>
        </div>
      </Modal>

      {/* Delete User Confirmation */}
      <Modal isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setSelectedUser(null); }} title="Удалить пользователя?" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">Вы уверены, что хотите удалить аккаунт <strong>{selectedUser?.email}</strong>? Это действие нельзя отменить.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowDeleteConfirm(false); setSelectedUser(null); }}>Отмена</Button>
            <Button variant="primary" className="!bg-red-600 hover:!bg-red-700" onClick={handleDeleteUser}>Удалить</Button>
          </div>
        </div>
      </Modal>

      {/* Create Department Modal */}
      <Modal isOpen={showCreateDeptModal} onClose={() => setShowCreateDeptModal(false)} title="Создать отдел" size="sm">
        <div className="space-y-4">
          <Input label="Ключ (уникальный) *" value={deptForm.key} onChange={(e) => setDeptForm({ ...deptForm, key: e.target.value })} placeholder="ENGINEERING" required />
          <Input label="Название (RU) *" value={deptForm.name_ru} onChange={(e) => setDeptForm({ ...deptForm, name_ru: e.target.value })} required />
          <Input label="Название (KZ) *" value={deptForm.name_kz} onChange={(e) => setDeptForm({ ...deptForm, name_kz: e.target.value })} required />
          <Input label="Описание" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateDeptModal(false)}>Отмена</Button>
            <Button onClick={handleCreateDept}>Создать</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Department Modal */}
      <Modal isOpen={showEditDeptModal} onClose={() => { setShowEditDeptModal(false); setSelectedDept(null); }} title={`Редактировать отдел: ${selectedDept?.name_ru}`} size="sm">
        <div className="space-y-4">
          <Input label="Ключ *" value={deptForm.key} onChange={(e) => setDeptForm({ ...deptForm, key: e.target.value })} required />
          <Input label="Название (RU) *" value={deptForm.name_ru} onChange={(e) => setDeptForm({ ...deptForm, name_ru: e.target.value })} required />
          <Input label="Название (KZ) *" value={deptForm.name_kz} onChange={(e) => setDeptForm({ ...deptForm, name_kz: e.target.value })} required />
          <Input label="Описание" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => { setShowEditDeptModal(false); setSelectedDept(null); }}>Отмена</Button>
            <Button onClick={handleUpdateDept}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Department Confirmation */}
      <Modal isOpen={showDeleteDeptConfirm} onClose={() => { setShowDeleteDeptConfirm(false); setSelectedDept(null); }} title="Удалить отдел?" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">Вы уверены, что хотите удалить отдел <strong>{selectedDept?.name_ru}</strong>? Отдел с привязанными пользователями удалить нельзя.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowDeleteDeptConfirm(false); setSelectedDept(null); }}>Отмена</Button>
            <Button variant="primary" className="!bg-red-600 hover:!bg-red-700" onClick={handleDeleteDept}>Удалить</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Project Confirmation */}
      <Modal isOpen={showDeleteProjectConfirm} onClose={() => { setShowDeleteProjectConfirm(false); setSelectedDeletedProject(null); }} title={t('project.deleteProjectPermanently')} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">{t('project.deleteProjectPermanentlyConfirm')}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowDeleteProjectConfirm(false); setSelectedDeletedProject(null); }}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleDeleteProjectPermanently}>{t('project.deleteProjectPermanently')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
