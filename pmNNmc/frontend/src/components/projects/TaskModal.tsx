import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import type { AssignableUser, Department, Task } from '../../types';
import { projectsApi } from '../../api/projects';
import { useProjectStore } from '../../store/projectStore';
import { useAuthStore, useUserRole } from '../../store/authStore';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface TaskModalProps {
  task?: Task;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    completed: boolean;
    assigneeId?: number;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  projectDueDate?: string;
  projectDepartmentKey?: Department['key'];
  projectDepartmentName?: string;
}

export default function TaskModal({
  task,
  isOpen,
  onClose,
  onSave,
  projectDueDate,
  projectDepartmentKey,
  projectDepartmentName,
}: TaskModalProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { isSuperAdmin } = useUserRole();
  const { departments, fetchDepartments } = useProjectStore();

  const userDepartmentKey = user?.department?.key || '';
  const effectiveProjectDepartmentKey = projectDepartmentKey || userDepartmentKey;
  const departmentMismatchWithUser = Boolean(
    !isSuperAdmin &&
      projectDepartmentKey &&
      userDepartmentKey &&
      projectDepartmentKey !== userDepartmentKey
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [completed, setCompleted] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeDepartment, setAssigneeDepartment] = useState(
    isSuperAdmin ? effectiveProjectDepartmentKey : effectiveProjectDepartmentKey
  );
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const projectDeadline = projectDueDate ? projectDueDate.split('T')[0] : undefined;
  const effectiveAssigneeDepartment = isSuperAdmin
    ? assigneeDepartment
    : effectiveProjectDepartmentKey;

  useEffect(() => {
    if (isSuperAdmin && departments.length === 0) {
      fetchDepartments();
    }
  }, [isSuperAdmin, departments.length, fetchDepartments]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setAssigneeDepartment(effectiveProjectDepartmentKey);
    }
  }, [isSuperAdmin, effectiveProjectDepartmentKey]);

  useEffect(() => {
    if (isSuperAdmin && !assigneeDepartment && effectiveProjectDepartmentKey) {
      setAssigneeDepartment(effectiveProjectDepartmentKey);
    }
  }, [isSuperAdmin, assigneeDepartment, effectiveProjectDepartmentKey]);

  useEffect(() => {
    let isMounted = true;

    const loadAssignableUsers = async () => {
      if (!isOpen) return;

      setIsUsersLoading(true);
      setUsersError('');

      if (departmentMismatchWithUser) {
        setAssignableUsers([]);
        setUsersError(t('task.departmentForbidden'));
        setIsUsersLoading(false);
        return;
      }

      try {
        const users = await projectsApi.getAssignableUsers(
          effectiveAssigneeDepartment || undefined
        );
        if (isMounted) {
          setAssignableUsers(users);
        }
      } catch (error) {
        if (isMounted) {
          setUsersError(t('project.assignableUsersLoadError'));
        }
      } finally {
        if (isMounted) {
          setIsUsersLoading(false);
        }
      }
    };

    loadAssignableUsers();
    return () => {
      isMounted = false;
    };
  }, [departmentMismatchWithUser, effectiveAssigneeDepartment, isOpen, t]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setCompleted(Boolean(task.completed));
      setAssigneeId(task.assignee?.id ? task.assignee.id.toString() : '');
      setStartDate(task.startDate || '');
      setEndDate(task.endDate || '');
    } else {
      setTitle('');
      setDescription('');
      setCompleted(false);
      setAssigneeId('');
      setStartDate('');
      setEndDate('');
    }
    setDateError(null);
    setSubmitError('');
  }, [task, isOpen]);

  const getDepartmentLabel = (department: Department) =>
    i18n.language === 'kz' ? department.name_kz : department.name_ru;

  const assigneeDepartmentOptions = departments.map((dept) => ({
    value: dept.key,
    label: getDepartmentLabel(dept),
  }));

  const assigneeCandidates = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    assignableUsers.forEach((assignee) => {
      map.set(assignee.id.toString(), assignee);
    });
    if (task?.assignee && !map.has(task.assignee.id.toString())) {
      map.set(task.assignee.id.toString(), task.assignee);
    }
    if (user && !map.has(user.id.toString())) {
      map.set(user.id.toString(), user);
    }
    return Array.from(map.values());
  }, [assignableUsers, task?.assignee, user]);

  const assigneeOptions = assigneeCandidates.map((assignee) => ({
    value: assignee.id.toString(),
    label: `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || assignee.username,
  }));

  const selectedAssignee =
    assigneeCandidates.find((assignee) => assignee.id.toString() === assigneeId) || null;
  const assigneeDepartmentKey = selectedAssignee?.department?.key || null;
  const assigneeDepartmentMismatch = Boolean(
    !isSuperAdmin &&
      effectiveProjectDepartmentKey &&
      assigneeDepartmentKey &&
      assigneeDepartmentKey !== effectiveProjectDepartmentKey
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitError('');

    if (departmentMismatchWithUser) {
      setSubmitError(t('task.departmentForbidden'));
      return;
    }

    if (assigneeDepartmentMismatch) {
      setSubmitError(t('task.departmentForbidden'));
      return;
    }

    if (projectDeadline) {
      if ((startDate && startDate > projectDeadline) || (endDate && endDate > projectDeadline)) {
        setDateError(t('task.deadlineExceeded'));
        return;
      }
    }

    setDateError(null);
    setIsLoading(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        completed,
        assigneeId: assigneeId ? parseInt(assigneeId, 10) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('error.generic');
      setSubmitError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? t('task.editTask') : t('task.createTask')}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <Input
          label={t('task.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('task.title')}
          required
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t('project.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('project.description')}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all resize-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="task-completed"
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="task-completed" className="text-sm text-slate-700">
            {completed ? t('task.done') : t('task.todo')}
          </label>
        </div>

        {isSuperAdmin && assigneeDepartmentOptions.length > 0 && (
          <Select
            label={t('project.assigneeDepartment')}
            options={assigneeDepartmentOptions}
            value={assigneeDepartment}
            onChange={(e) => setAssigneeDepartment(e.target.value)}
            placeholder={projectDepartmentName || t('common.all')}
          />
        )}

        <div className="space-y-2">
          <Select
            label={t('task.assignee')}
            options={assigneeOptions}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            placeholder={t('task.assigneePlaceholder')}
            disabled={departmentMismatchWithUser || isUsersLoading}
          />
          {projectDepartmentName && (
            <p className="text-xs text-slate-500">
              {t('project.assigneeDepartment')}: {projectDepartmentName}
            </p>
          )}
          {isUsersLoading && <p className="text-xs text-slate-500">{t('common.loading')}</p>}
          {usersError && <p className="text-xs text-red-600">{usersError}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            type="date"
            label={t('project.startDate')}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (dateError) setDateError(null);
            }}
            max={projectDeadline}
          />
          <Input
            type="date"
            label={t('project.dueDate')}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (dateError) setDateError(null);
            }}
            max={projectDeadline}
          />
        </div>
        {dateError && <p className="text-sm text-red-600">{dateError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isLoading} icon={<Save className="w-4 h-4" />}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
