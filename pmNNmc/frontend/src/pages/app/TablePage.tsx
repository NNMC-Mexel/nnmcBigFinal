import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Plus, ExternalLink, Archive, RotateCcw, Building2, Trash2 } from 'lucide-react';
import { useProjectStore, getProjectStage } from '../../store/projectStore';
import { useUserRole } from '../../store/authStore';
import { projectsApi } from '../../api/projects';
import type { Project } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import ProgressBar from '../../components/ui/ProgressBar';
import PriorityLight from '../../components/ui/PriorityLight';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';
import ProjectFormModal from '../../components/projects/ProjectFormModal';

export default function TablePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsKey = searchParams.toString();
  const isSyncingFromUrl = useRef(false);
  const { departmentKey, userDepartment, isAdmin, canEditProject, canEdit, canDeleteProject } = useUserRole();
  const {
    projects,
    stages,
    departments,
    isLoading,
    fetchProjects,
    fetchStages,
    fetchDepartments,
  } = useProjectStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [specialFilter, setSpecialFilter] = useState(''); // overdue, dueSoon
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [purgeProject, setPurgeProject] = useState<Project | null>(null);
  const [isPurgingProject, setIsPurgingProject] = useState(false);

  // Читаем фильтры из URL при загрузке
  useEffect(() => {
    isSyncingFromUrl.current = true;
    const filter = searchParams.get('filter');
    const dept = searchParams.get('department') || '';
    const priority = searchParams.get('priority') || '';
    const search = searchParams.get('search') || '';

    let nextStatus = '';
    let nextSpecial = '';
    if (filter === 'active') {
      nextStatus = 'ACTIVE';
    } else if (filter === 'archived') {
      nextStatus = 'ARCHIVED';
    } else if (filter === 'deleted') {
      if (isAdmin) {
        nextStatus = 'DELETED';
      }
    } else if (filter === 'overdue') {
      nextSpecial = 'overdue';
    } else if (filter === 'dueSoon') {
      nextSpecial = 'dueSoon';
    }

    if (statusFilter !== nextStatus) {
      setStatusFilter(nextStatus);
    }
    if (specialFilter !== nextSpecial) {
      setSpecialFilter(nextSpecial);
    }
    if (priorityFilter !== priority) {
      setPriorityFilter(priority);
    }
    if (searchTerm !== search) {
      setSearchTerm(search);
    }

    if (isAdmin) {
      if (deptFilter !== dept) {
        setDeptFilter(dept);
      }
    } else if (deptFilter !== '') {
      setDeptFilter('');
    }
  }, [paramsKey, isAdmin]);

  useEffect(() => {
    if (isSyncingFromUrl.current) {
      isSyncingFromUrl.current = false;
      return;
    }
    const params = new URLSearchParams();
    let filterValue = '';
    if (specialFilter === 'overdue') {
      filterValue = 'overdue';
    } else if (specialFilter === 'dueSoon') {
      filterValue = 'dueSoon';
    } else if (statusFilter === 'ACTIVE') {
      filterValue = 'active';
    } else if (statusFilter === 'ARCHIVED') {
      filterValue = 'archived';
    } else if (statusFilter === 'DELETED' && isAdmin) {
      filterValue = 'deleted';
    }

    if (filterValue) {
      params.set('filter', filterValue);
    }
    if (isAdmin && deptFilter) {
      params.set('department', deptFilter);
    }
    if (priorityFilter) {
      params.set('priority', priorityFilter);
    }
    if (searchTerm) {
      params.set('search', searchTerm);
    }

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
  }, [statusFilter, specialFilter, deptFilter, priorityFilter, searchTerm, isAdmin, searchParams, setSearchParams]);

  useEffect(() => {
    fetchStages();
    fetchDepartments();
  }, [fetchStages, fetchDepartments]);

  // Функция для формирования фильтров
  const getFilters = (): Record<string, string | undefined> => {
    const filters: Record<string, string | undefined> = {};
    
    // Admin (SuperAdmin) может видеть все отделы и фильтровать
    // Lead и Member видят только свой отдел
    if (isAdmin) {
      // Admin может фильтровать по любому отделу
      if (deptFilter) {
        filters.department = deptFilter;
      }
    } else if (departmentKey) {
      // Lead и Member видят только свой отдел
      filters.department = departmentKey;
    }
    
    if (statusFilter) {
      filters.status = statusFilter;
    }
    
    if (searchTerm) {
      filters.search = searchTerm;
    }
    
    return filters;
  };

  // Загрузка проектов с фильтрами
  useEffect(() => {
    const loadProjects = async () => {
      await fetchProjects(getFilters());
    };
    
    const timer = setTimeout(loadProjects, 300);
    return () => clearTimeout(timer);
  }, [deptFilter, statusFilter, searchTerm, isAdmin, departmentKey, fetchProjects]);

  // Фильтрация на клиенте для overdue/dueSoon/priority
  const filteredProjects = projects.filter((project) => {
    if (project.status === 'DELETED' && statusFilter !== 'DELETED') return false;
    if (specialFilter === 'overdue' && !project.overdue) return false;
    if (specialFilter === 'dueSoon' && !project.dueSoon) return false;
    if (priorityFilter && project.priorityLight !== priorityFilter) return false;
    return true;
  });

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setDeptFilter('');
    setPriorityFilter('');
    setSpecialFilter('');
    setSearchParams({});
  };

  const handleArchive = async (documentId: string) => {
    try {
      await projectsApi.archive(documentId);
      fetchProjects(getFilters());
    } catch (error) {
      console.error('Failed to archive:', error);
    }
  };

  const handleRestore = async (documentId: string) => {
    try {
      await projectsApi.restore(documentId);
      fetchProjects(getFilters());
    } catch (error) {
      console.error('Failed to restore:', error);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteProject) return;
    setIsDeletingProject(true);
    try {
      await projectsApi.softDelete(deleteProject.documentId);
      setDeleteProject(null);
      fetchProjects(getFilters());
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handlePurgeProject = async () => {
    if (!purgeProject) return;
    setIsPurgingProject(true);
    try {
      await projectsApi.delete(purgeProject.documentId);
      setPurgeProject(null);
      fetchProjects(getFilters());
    } catch (error) {
      console.error('Failed to delete project permanently:', error);
    } finally {
      setIsPurgingProject(false);
    }
  };

  const getDepartmentName = (dept?: { name_ru: string; name_kz: string }) => {
    if (!dept) return '';
    return i18n.language === 'kz' ? dept.name_kz : dept.name_ru;
  };

  const bucketOrder = (order?: number | null) => {
    if (!order || !Number.isFinite(order)) return 1;
    if (order <= 1) return 1;
    if (order >= 5) return 5;
    return Math.round(order);
  };

  const getStageName = (project: Project) => {
    const stage = getProjectStage(project, stages);
    if (!stage) return '';
    const order = bucketOrder(stage.order);
    if (order === 1) return t('workflow.ideas.title');
    if (order === 2) return t('workflow.preparation.title');
    if (order === 3) return t('workflow.inProgress.title');
    if (order === 4) return t('workflow.testing.title');
    return t('workflow.production.title');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU');
  };

  const getUserDepartmentName = () => {
    if (!userDepartment) return 'Все отделы';
    return i18n.language === 'kz' ? userDepartment.name_kz : userDepartment.name_ru;
  };

  // Опции фильтров
  const statusOptions = [
    { value: '', label: t('common.all') },
    { value: 'ACTIVE', label: t('status.ACTIVE') },
    { value: 'ARCHIVED', label: t('status.ARCHIVED') },
    ...(isAdmin ? [{ value: 'DELETED', label: t('status.DELETED') }] : []),
  ];

  const departmentOptions = [
    { value: '', label: 'Все отделы' },
    ...departments.map((d) => ({
      value: d.key,
      label: getDepartmentName(d),
    })),
  ];

  const priorityOptions = [
    { value: '', label: 'Все приоритеты' },
    { value: 'RED', label: t('priority.RED') },
    { value: 'YELLOW', label: t('priority.YELLOW') },
    { value: 'GREEN', label: t('priority.GREEN') },
  ];

  const specialOptions = [
    { value: '', label: 'Все проекты' },
    { value: 'overdue', label: 'Просроченные' },
    { value: 'dueSoon', label: 'Скоро дедлайн' },
  ];

  // Только SuperAdmin может фильтровать по отделам
  const canFilterByDept = isAdmin;

  if (isLoading && projects.length === 0) {
    return <Loader text={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800">
            {t('table.title')}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Building2 className="w-4 h-4 text-slate-400" />
            {isAdmin ? (
              <span className="text-slate-500">SuperAdmin • Все отделы</span>
            ) : (
              <Badge variant={userDepartment?.key === 'IT' ? 'it' : userDepartment?.key === 'DIGITALIZATION' ? 'digital' : 'default'}>
                {getUserDepartmentName()}
              </Badge>
            )}
            <span className="text-slate-500">• {filteredProjects.length} проект(ов)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="secondary"
              onClick={() => {
                setStatusFilter('DELETED');
                setSpecialFilter('');
              }}
              icon={<Trash2 className="w-4 h-4" />}
            >
              {t('project.deletedProjects')}
            </Button>
          )}
          {canEditProject && (
            <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-4 h-4" />}>
              {t('project.createProject')}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          {/* Фильтр по отделу - только для руководителей */}
          {canFilterByDept && (
            <div className="w-40">
              <Select
                options={departmentOptions}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              />
            </div>
          )}
          
          <div className="w-36">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value;
                setStatusFilter(value);
                if (value === 'DELETED') {
                  setSpecialFilter('');
                }
              }}
            />
          </div>
          
          <div className="w-40">
            <Select
              options={priorityOptions}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            />
          </div>
          
          <div className="w-40">
            <Select
              options={specialOptions}
              value={specialFilter}
              onChange={(e) => setSpecialFilter(e.target.value)}
            />
          </div>
          
          <Button variant="ghost" onClick={handleClearFilters} icon={<Filter className="w-4 h-4" />}>
            Сбросить
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">{t('project.title')}</th>
                <th className="px-4 py-3 font-medium">{t('project.department')}</th>
                <th className="px-4 py-3 font-medium">{t('project.startDate')}</th>
                <th className="px-4 py-3 font-medium">{t('project.dueDate')}</th>
                <th className="px-4 py-3 font-medium w-40">{t('project.progress')}</th>
                <th className="px-4 py-3 font-medium">{t('project.stage')}</th>
                <th className="px-4 py-3 font-medium text-center">{t('project.priority')}</th>
                <th className="px-4 py-3 font-medium">{t('project.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    {t('project.noProjects')}
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Название - кликабельное */}
                        <button
                          onClick={() => navigate(`/app/projects/${project.documentId}`)}
                          className="font-medium text-slate-800 hover:text-primary-600 hover:underline text-left"
                        >
                          {project.title}
                        </button>
                        {project.overdue && (
                          <Badge variant="danger" size="sm">{t('project.overdue')}</Badge>
                        )}
                        {project.dueSoon && !project.overdue && (
                          <Badge variant="warning" size="sm">{t('project.dueSoon')}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {project.department && (
                        <Badge
                          variant={project.department.key === 'IT' ? 'it' : 'digital'}
                          size="sm"
                        >
                          {getDepartmentName(project.department)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(project.startDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(project.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar value={project.progressPercent || 0} showLabel size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-slate-600">{getStageName(project)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <PriorityLight priority={project.priorityLight} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          project.status === 'ACTIVE'
                            ? 'success'
                            : project.status === 'DELETED'
                            ? 'danger'
                            : 'default'
                        }
                        size="sm"
                      >
                        {t(`status.${project.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/app/projects/${project.documentId}`)}
                          className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Открыть"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        {project.status === 'DELETED' && isAdmin && (
                          <>
                            <button
                              onClick={() => handleRestore(project.documentId)}
                              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title={t('project.restoreProject')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPurgeProject(project)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('project.deleteProjectPermanently')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {/* Архивирование/восстановление - только для Lead/Admin */}
                        {canEdit && project.status !== 'DELETED' && (
                          project.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleArchive(project.documentId)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title={t('project.archiveProject')}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRestore(project.documentId)}
                              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title={t('project.restoreProject')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )
                        )}
                        {canDeleteProject && project.status !== 'DELETED' && (
                          <button
                            onClick={() => setDeleteProject(project)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('project.deleteProject')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Project Modal */}
      {showCreateModal && (
        <ProjectFormModal
          defaultDepartment={userDepartment}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchProjects(getFilters());
          }}
        />
      )}

      {/* Delete Project Modal */}
      <Modal
        isOpen={Boolean(deleteProject)}
        onClose={() => setDeleteProject(null)}
        title={t('project.deleteProject')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('project.deleteProjectConfirm')}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteProject(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteProject} loading={isDeletingProject}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(purgeProject)}
        onClose={() => setPurgeProject(null)}
        title={t('project.deleteProjectPermanently')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('project.deleteProjectPermanentlyConfirm')}</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPurgeProject(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handlePurgeProject} loading={isPurgingProject}>
              {t('project.deleteProjectPermanently')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
