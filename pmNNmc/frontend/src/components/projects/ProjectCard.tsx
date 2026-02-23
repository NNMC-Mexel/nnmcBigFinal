import { useTranslation } from 'react-i18next';
import { Calendar, Users, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import type { Project } from '../../types';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import PriorityLight from '../ui/PriorityLight';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  isDragging?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
}

export default function ProjectCard({
  project,
  onClick,
  isDragging,
  canDelete,
  onDelete,
}: ProjectCardProps) {
  const { t, i18n } = useTranslation();

  const getDepartmentName = () => {
    if (!project.department) return '';
    return i18n.language === 'kz' ? project.department.name_kz : project.department.name_ru;
  };

  const getDepartmentVariant = () => {
    return project.department?.key === 'IT' ? 'it' : 'digital';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем drag при клике на название
    onClick();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <Card
      className={`transition-all ${isDragging ? 'opacity-50 shadow-xl' : ''} ${
        project.overdue ? 'border-red-300 border-2' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* Название - кликабельное */}
        <button
          onClick={handleTitleClick}
          className="font-semibold text-slate-800 line-clamp-2 text-left hover:text-primary-600 hover:underline"
        >
          {project.title}
        </button>
        <div className="flex items-center gap-2">
          {canDelete && onDelete && (
            <button
              onClick={handleDeleteClick}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={t('project.deleteProject')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <PriorityLight priority={project.priorityLight} />
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {project.department && (
          <Badge variant={getDepartmentVariant()} size="sm">
            {getDepartmentName()}
          </Badge>
        )}
        {project.overdue && (
          <Badge variant="danger" size="sm">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {t('project.overdue')}
          </Badge>
        )}
        {project.dueSoon && !project.overdue && (
          <Badge variant="warning" size="sm">
            <Clock className="w-3 h-3 mr-1" />
            {t('project.dueSoon')}
          </Badge>
        )}
        {project.status === 'ARCHIVED' && (
          <Badge variant="default" size="sm">
            {t('status.ARCHIVED')}
          </Badge>
        )}
        {project.status === 'DELETED' && (
          <Badge variant="danger" size="sm">
            {t('status.DELETED')}
          </Badge>
        )}
      </div>

      {/* Progress */}
      <div className="mb-3">
        <ProgressBar value={project.progressPercent || 0} showLabel size="sm" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        {project.dueDate && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(project.dueDate)}
          </div>
        )}
        {project.responsibleUsers && project.responsibleUsers.length > 0 && (
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {project.responsibleUsers.length}
          </div>
        )}
        {project.totalTasks !== undefined && (
          <div className="text-slate-400">
            {project.doneTasks}/{project.totalTasks}
          </div>
        )}
      </div>
    </Card>
  );
}
