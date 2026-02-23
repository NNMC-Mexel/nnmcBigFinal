import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Plus,
  AlertCircle,
  Building2,
  AlertTriangle,
  Trash2,
  Lightbulb,
  ClipboardList,
  Hammer,
  FlaskConical,
  Rocket,
  Archive,
} from 'lucide-react';
import { useProjectStore, getProjectStage } from '../../store/projectStore';
import { useUserRole } from '../../store/authStore';
import { projectsApi } from '../../api/projects';
import type { Project, BoardStage } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';
import ProjectCard from '../../components/projects/ProjectCard';
import KanbanColumn from '../../components/projects/KanbanColumn';
import ProjectFormModal from '../../components/projects/ProjectFormModal';

export default function BoardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsKey = searchParams.toString();
  const isSyncingFromUrl = useRef(false);
  const { departmentKey, userDepartment, isAdmin, canDragProjects, canEditProject, canDeleteProject } = useUserRole();
  const {
    projects,
    stages,
    departments,
    showArchiveColumn,
    isLoading,
    fetchProjects,
    fetchStages,
    fetchDepartments,
    setShowArchiveColumn,
    updateProjectLocally,
  } = useProjectStore();

  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deptFilter, setDeptFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [descriptionKey, setDescriptionKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchStages();
    fetchDepartments();
  }, [fetchStages, fetchDepartments]);

  useEffect(() => {
    isSyncingFromUrl.current = true;
    const dept = searchParams.get('department') || '';
    const priority = searchParams.get('priority') || '';
    const archive = searchParams.get('archive') === '1';

    if (isAdmin && deptFilter !== dept) {
      setDeptFilter(dept);
    }
    if (priorityFilter !== priority) {
      setPriorityFilter(priority);
    }
    if (showArchiveColumn !== archive) {
      setShowArchiveColumn(archive);
    }
  }, [paramsKey, isAdmin, setShowArchiveColumn]);

  useEffect(() => {
    if (isSyncingFromUrl.current) {
      isSyncingFromUrl.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (isAdmin && deptFilter) {
      params.set('department', deptFilter);
    }
    if (priorityFilter) {
      params.set('priority', priorityFilter);
    }
    if (showArchiveColumn) {
      params.set('archive', '1');
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
  }, [deptFilter, priorityFilter, showArchiveColumn, isAdmin, searchParams, setSearchParams]);

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
    
    return filters;
  };

  useEffect(() => {
    fetchProjects(getFilters());
  }, [departmentKey, deptFilter, isAdmin, fetchProjects]);

  // Фильтрация по приоритету на клиенте
  const filteredProjects = projects.filter((project) => {
    if (project.status === 'DELETED') return false;
    if (project.status === 'ARCHIVED' && !showArchiveColumn) return false;
    if (priorityFilter && project.priorityLight !== priorityFilter) return false;
    return true;
  });

  const columnDefs = useMemo(
    () => [
      {
        key: 'IDEAS',
        order: 1,
        i18nKey: 'workflow.ideas',
        title: t('workflow.ideas.title'),
        icon: <Lightbulb className="h-4 w-4" />,
        iconClassName: 'text-amber-600',
        iconBgClassName: 'border-amber-200 bg-amber-50',
      },
      {
        key: 'PREPARATION',
        order: 2,
        i18nKey: 'workflow.preparation',
        title: t('workflow.preparation.title'),
        icon: <ClipboardList className="h-4 w-4" />,
        iconClassName: 'text-sky-600',
        iconBgClassName: 'border-sky-200 bg-sky-50',
      },
      {
        key: 'IN_PROGRESS',
        order: 3,
        i18nKey: 'workflow.inProgress',
        title: t('workflow.inProgress.title'),
        icon: <Hammer className="h-4 w-4" />,
        iconClassName: 'text-orange-600',
        iconBgClassName: 'border-orange-200 bg-orange-50',
      },
      {
        key: 'TESTING',
        order: 4,
        i18nKey: 'workflow.testing',
        title: t('workflow.testing.title'),
        icon: <FlaskConical className="h-4 w-4" />,
        iconClassName: 'text-emerald-600',
        iconBgClassName: 'border-emerald-200 bg-emerald-50',
      },
      {
        key: 'PRODUCTION',
        order: 5,
        i18nKey: 'workflow.production',
        title: t('workflow.production.title'),
        icon: <Rocket className="h-4 w-4" />,
        iconClassName: 'text-indigo-600',
        iconBgClassName: 'border-indigo-200 bg-indigo-50',
      },
    ],
    [t]
  );

  type BoardColumn = {
    key: string;
    order: number;
    i18nKey: string;
    title: string;
    icon?: ReactNode;
    iconClassName?: string;
    iconBgClassName?: string;
    stage?: BoardStage;
    isArchive?: boolean;
  };

  const bucketOrder = (order?: number | null) => {
    if (!order || !Number.isFinite(order)) return 1;
    if (order <= 1) return 1;
    if (order >= 5) return 5;
    return Math.round(order);
  };

  const orderToKey = useMemo(
    () =>
      columnDefs.reduce<Record<number, string>>((acc, def) => {
        acc[def.order] = def.key;
        return acc;
      }, {}),
    [columnDefs]
  );

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [stages]
  );

  const stageByBucketOrder = useMemo(() => {
    const map = new Map<number, BoardStage>();
    sortedStages.forEach((stage) => {
      const bucket = bucketOrder(stage.order);
      if (!map.has(bucket)) {
        map.set(bucket, stage);
      }
    });
    const fallback = sortedStages[0];
    columnDefs.forEach((def) => {
      if (!map.has(def.order) && fallback) {
        map.set(def.order, fallback);
      }
    });
    return map;
  }, [columnDefs, sortedStages]);

  const columns = useMemo<BoardColumn[]>(
    () =>
      columnDefs
        .map((def) => ({
          ...def,
          stage: stageByBucketOrder.get(def.order),
        }))
        .filter((col) => Boolean(col.stage)),
    [columnDefs, stageByBucketOrder]
  );

  const archiveColumn = useMemo<BoardColumn>(
    () => ({
      key: 'ARCHIVE',
      order: 6,
      i18nKey: 'workflow.archive',
      title: t('workflow.archive.title'),
      icon: <Archive className="h-4 w-4" />,
      iconClassName: 'text-slate-600',
      iconBgClassName: 'border-slate-200 bg-slate-50',
      isArchive: true,
    }),
    [t]
  );

  const boardColumns = useMemo<BoardColumn[]>(
    () => (showArchiveColumn ? [...columns, archiveColumn] : columns),
    [showArchiveColumn, columns, archiveColumn]
  );

  const getColumnKeyForStage = (stage?: BoardStage) => {
    const bucket = bucketOrder(stage?.order);
    return orderToKey[bucket] || orderToKey[1];
  };

  const activeColumn = descriptionKey
    ? columns.find((col) => col.key === descriptionKey) || null
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    const project = filteredProjects.find((p) => p.documentId === event.active.id);
    setActiveProject(project || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProject(null);

    if (!canDragProjects) return;
    if (!over) return;

    const projectDocumentId = active.id as string;
    const targetColumnKey = over.id as string;

    const project = filteredProjects.find((p) => p.documentId === projectDocumentId);
    if (!project) return;

    if (targetColumnKey === 'ARCHIVE') {
      if (project.status === 'ARCHIVED') return;
      await archiveProject(projectDocumentId);
      return;
    }

    const targetColumn = columns.find((col) => col.key === targetColumnKey);
    const targetStage = targetColumn?.stage;
    if (!targetStage) return;

    const currentColumnKey =
      project.status === 'ARCHIVED'
        ? 'ARCHIVE'
        : getColumnKeyForStage(getProjectStage(project, stages) || undefined);
    if (currentColumnKey === targetColumnKey) return;

    await moveProject(project, projectDocumentId, targetStage);
  };

  const archiveProject = async (projectDocumentId: string) => {
    try {
      await projectsApi.archive(projectDocumentId);
      updateProjectLocally(projectDocumentId, {
        status: 'ARCHIVED',
      });
    } catch (error) {
      console.error('Failed to archive project:', error);
    }
  };

  const moveProject = async (
    project: Project,
    projectDocumentId: string,
    targetStage: BoardStage
  ) => {
    try {
      if (project.status === 'ARCHIVED') {
        await projectsApi.restore(projectDocumentId);
      }
      await projectsApi.updateStage(projectDocumentId, targetStage.id);
      updateProjectLocally(projectDocumentId, {
        status: 'ACTIVE',
        manualStageOverride: targetStage,
      });
    } catch (error) {
      console.error('Failed to update stage:', error);
    }
  };

  const handleDeleteProject = (project: Project) => {
    setDeleteProject(project);
  };

  const handleConfirmDelete = async () => {
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

  const getProjectsForColumn = (columnKey: string) => {
    if (columnKey === 'ARCHIVE') {
      return filteredProjects.filter((project) => project.status === 'ARCHIVED');
    }
    return filteredProjects.filter((project) => {
      if (project.status !== 'ACTIVE') return false;
      const stage = getProjectStage(project, stages);
      return getColumnKeyForStage(stage || undefined) === columnKey;
    });
  };

  const getDepartmentName = () => {
    if (!userDepartment) return 'Все отделы';
    return i18n.language === 'kz' ? userDepartment.name_kz : userDepartment.name_ru;
  };

  // Только SuperAdmin может фильтровать по отделам
  const canFilterByDept = isAdmin;

  const departmentOptions = [
    { value: '', label: 'Все отделы' },
    ...departments.map((d) => ({
      value: d.key,
      label: i18n.language === 'kz' ? d.name_kz : d.name_ru,
    })),
  ];

  const priorityOptions = [
    { value: '', label: 'Все приоритеты' },
    { value: 'RED', label: t('priority.RED') },
    { value: 'YELLOW', label: t('priority.YELLOW') },
    { value: 'GREEN', label: t('priority.GREEN') },
  ];

  if (isLoading && projects.length === 0) {
    return <Loader text={t('common.loading')} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800">
            {t('board.title')}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Building2 className="w-4 h-4 text-slate-400" />
            {isAdmin ? (
              <span className="text-slate-500">SuperAdmin • Все отделы</span>
            ) : (
              <Badge variant={userDepartment?.key === 'IT' ? 'it' : userDepartment?.key === 'DIGITALIZATION' ? 'digital' : 'default'}>
                {getDepartmentName()}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="secondary"
              onClick={() => navigate('/app/table?filter=deleted')}
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
      <Card className="mb-4">
        <div className="flex flex-wrap gap-4 items-center">
          {canFilterByDept && (
            <div className="w-48">
              <Select
                options={departmentOptions}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              />
            </div>
          )}
          
          <div className="w-48">
            <Select
              options={priorityOptions}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            />
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchiveColumn}
              onChange={(e) => setShowArchiveColumn(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-slate-600">{t('board.showArchiveColumn')}</span>
          </label>
          
          <div className="ml-auto text-sm text-slate-500">
            {filteredProjects.length} проект(ов)
          </div>
        </div>
      </Card>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max items-stretch">
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column.key}
                columnKey={column.key}
                stage={column.stage}
                stageName={column.title}
                icon={column.icon}
                iconClassName={column.iconClassName}
                iconBgClassName={column.iconBgClassName}
                projects={getProjectsForColumn(column.key)}
                onProjectClick={(documentId) => navigate(`/app/projects/${documentId}`)}
                canDrag={canDragProjects}
                canDeleteProject={canDeleteProject}
                onDeleteProject={handleDeleteProject}
                onShowDescription={column.isArchive ? undefined : setDescriptionKey}
                descriptionLabel={column.isArchive ? undefined : t('workflow.descriptionButton')}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeProject ? (
            <div className="rotate-3 scale-105">
              <ProjectCard project={activeProject} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Column Description Modal */}
      <Modal
        isOpen={Boolean(activeColumn)}
        onClose={() => setDescriptionKey(null)}
        title={activeColumn ? t(`${activeColumn.i18nKey}.title`) : t('workflow.descriptionTitle')}
        size="md"
      >
        {activeColumn && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('workflow.sectionPurpose')}
              </p>
              <p className="mt-1">{t(`${activeColumn.i18nKey}.purpose`)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('workflow.sectionContent')}
              </p>
              <p className="mt-1">{t(`${activeColumn.i18nKey}.content`)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('workflow.sectionRules')}
              </p>
              <p className="mt-1">{t(`${activeColumn.i18nKey}.rules`)}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDescriptionKey(null)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Project Modal */}
      <Modal
        isOpen={Boolean(deleteProject)}
        onClose={() => setDeleteProject(null)}
        title={t('project.deleteProject')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{t('project.deleteProjectConfirm')}</p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteProject(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} loading={isDeletingProject}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

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
    </div>
  );
}
