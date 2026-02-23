import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Project, BoardStage } from '../../types';
import ProjectCard from './ProjectCard';

interface KanbanColumnProps {
  stage?: BoardStage;
  columnKey: string;
  stageName: string;
  icon?: ReactNode;
  iconClassName?: string;
  iconBgClassName?: string;
  projects: Project[];
  onProjectClick: (documentId: string) => void;
  canDrag: boolean;
  canDeleteProject?: boolean;
  onDeleteProject?: (project: Project) => void;
  onShowDescription?: (columnKey: string) => void;
  descriptionLabel?: string;
}

export default function KanbanColumn({
  stage,
  columnKey,
  stageName,
  icon,
  iconClassName,
  iconBgClassName,
  projects,
  onProjectClick,
  canDrag,
  canDeleteProject,
  onDeleteProject,
  onShowDescription,
  descriptionLabel,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnKey,
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 flex flex-col rounded-xl transition-colors ${
        isOver ? 'bg-primary-50' : 'bg-slate-100'
      }`}
    >
      {/* Column Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${iconBgClassName ?? 'border-slate-200 bg-white'} ${iconClassName ?? 'text-slate-500'}`}
            >
              {icon}
            </span>
          )}
          <h3 className="font-semibold text-slate-700">{stageName}</h3>
          <span className="ml-auto px-2 py-0.5 bg-white rounded-full text-xs font-medium text-slate-500">
            {projects.length}
          </span>
        </div>
      </div>

      {/* Projects */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {projects.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            Нет проектов
          </div>
        ) : (
          projects.map((project) => (
            <DraggableProjectCard
              key={project.id}
              project={project}
              onProjectClick={onProjectClick}
              canDrag={canDrag}
              canDeleteProject={canDeleteProject}
              onDeleteProject={onDeleteProject}
            />
          ))
        )}
      </div>

      {onShowDescription && descriptionLabel && (
        <div className="p-2 pt-0">
          <button
            type="button"
            onClick={() => onShowDescription(columnKey)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-primary-300 hover:text-primary-600 transition-colors"
          >
            {descriptionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

interface DraggableProjectCardProps {
  project: Project;
  onProjectClick: (documentId: string) => void;
  canDrag: boolean;
  canDeleteProject?: boolean;
  onDeleteProject?: (project: Project) => void;
}

function DraggableProjectCard({
  project,
  onProjectClick,
  canDrag,
  canDeleteProject,
  onDeleteProject,
}: DraggableProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.documentId,
    disabled: !canDrag,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
    >
      <ProjectCard
        project={project}
        onClick={() => onProjectClick(project.documentId)}
        isDragging={isDragging}
        canDelete={canDeleteProject}
        onDelete={onDeleteProject ? () => onDeleteProject(project) : undefined}
      />
    </div>
  );
}
