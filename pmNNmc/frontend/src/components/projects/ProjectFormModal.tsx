import { useState, FormEvent, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, Info } from 'lucide-react';
import type { Project, Department, AssignableUser } from '../../types';
import { projectsApi } from '../../api/projects';
import { useProjectStore } from '../../store/projectStore';
import { useAuthStore, useUserRole } from '../../store/authStore';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

interface ProjectFormModalProps {
  project?: Project;
  defaultDepartment?: Department;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProjectFormModal({
  project,
  defaultDepartment,
  onClose,
  onSuccess,
}: ProjectFormModalProps) {
  const { t, i18n } = useTranslation();
  const { departments, fetchDepartments } = useProjectStore();
  const { user } = useAuthStore();
  const { isAdmin, isLead, isSuperAdmin } = useUserRole();
  const canManageOwner = isAdmin || isLead;

  useEffect(() => {
    if (departments.length === 0) {
      fetchDepartments();
    }
  }, [departments.length, fetchDepartments]);

  const userDepartmentKey = user?.department?.key || '';
  const initialDepartmentKey =
    project?.department?.key || defaultDepartment?.key || userDepartmentKey || '';

  const [formData, setFormData] = useState({
    title: project?.title || '',
    description: project?.description || '',
    startDate: project?.startDate || '',
    dueDate: project?.dueDate || '',
    priorityLight: project?.priorityLight || 'GREEN',
    status: project?.status || 'ACTIVE',
  });
  const [ownerId, setOwnerId] = useState(
    project?.owner?.id?.toString() || user?.id?.toString() || ''
  );
  const [supportingIds, setSupportingIds] = useState<string[]>(
    project?.supportingSpecialists?.map((assignee) => assignee.id.toString()) || []
  );
  const [assigneeDepartment, setAssigneeDepartment] = useState(
    isSuperAdmin ? initialDepartmentKey : userDepartmentKey || initialDepartmentKey
  );
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [dateErrors, setDateErrors] = useState({ startDate: '', dueDate: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedDepartment = useMemo(() => {
    if (assigneeDepartment) {
      const found = departments.find((dept) => dept.key === assigneeDepartment);
      if (found) return found;
    }
    if (project?.department) return project.department;
    if (defaultDepartment) return defaultDepartment;
    if (user?.department) return user.department;
    return null;
  }, [departments, assigneeDepartment, project?.department, defaultDepartment, user?.department]);
  const selectedDepartmentKey = selectedDepartment?.key || assigneeDepartment || userDepartmentKey;
  const departmentMismatchWithUser = Boolean(
    !isSuperAdmin &&
      selectedDepartmentKey &&
      userDepartmentKey &&
      selectedDepartmentKey !== userDepartmentKey
  );
  const effectiveAssigneeDepartment = isSuperAdmin
    ? assigneeDepartment || selectedDepartmentKey
    : userDepartmentKey || selectedDepartmentKey;

  useEffect(() => {
    if (!project && !ownerId && user?.id) {
      setOwnerId(user.id.toString());
    }
  }, [project, ownerId, user?.id]);

  useEffect(() => {
    if (ownerId && supportingIds.includes(ownerId)) {
      setSupportingIds((prev) => prev.filter((id) => id !== ownerId));
    }
  }, [ownerId, supportingIds]);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (userDepartmentKey && assigneeDepartment !== userDepartmentKey) {
      setAssigneeDepartment(userDepartmentKey);
    }
  }, [isSuperAdmin, assigneeDepartment, userDepartmentKey]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (!assigneeDepartment && selectedDepartmentKey) {
      setAssigneeDepartment(selectedDepartmentKey);
    }
  }, [isSuperAdmin, assigneeDepartment, selectedDepartmentKey]);

  useEffect(() => {
    let isMounted = true;

    const loadAssignableUsers = async () => {
      setIsUsersLoading(true);
      setUsersError('');
      if (departmentMismatchWithUser) {
        setAssignableUsers([]);
        setUsersError(t('project.ownerDepartmentMismatch'));
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
      } catch (err) {
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
  }, [departmentMismatchWithUser, effectiveAssigneeDepartment, t]);
  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'startDate' || field === 'dueDate') {
      setDateErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setOwnerError('');
    setDateErrors({ startDate: '', dueDate: '' });

    try {
      const mustProvideOwner = canManageOwner || !project;
      if (mustProvideOwner && !ownerId) {
        setOwnerError(t('project.ownerRequired'));
        setIsLoading(false);
        return;
      }
      if (!isSuperAdmin && (departmentMismatchWithUser || ownerDepartmentMismatch)) {
        setOwnerError(t('project.ownerDepartmentMismatch'));
        setIsLoading(false);
        return;
      }

      const selectedDepartmentId = selectedDepartment?.id;
      if (!selectedDepartmentId) {
        setError(t('project.departmentRequired'));
        setIsLoading(false);
        return;
      }

      const dateValidation = { startDate: '', dueDate: '' };
      if (!formData.startDate) {
        dateValidation.startDate = t('project.startDateRequired');
      }
      if (!formData.dueDate) {
        dateValidation.dueDate = t('project.dueDateRequired');
      }
      if (
        formData.startDate &&
        formData.dueDate &&
        formData.dueDate < formData.startDate
      ) {
        dateValidation.dueDate = t('project.dueDateBeforeStart');
      }

      if (dateValidation.startDate || dateValidation.dueDate) {
        setDateErrors(dateValidation);
        const hasRangeError =
          formData.startDate &&
          formData.dueDate &&
          formData.dueDate < formData.startDate;
        setError(hasRangeError ? t('project.dueDateBeforeStart') : t('project.deadlinesRequired'));
        setIsLoading(false);
        return;
      }

      const data: any = {
        title: formData.title,
        description: formData.description,
        department: selectedDepartmentId,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        priorityLight: formData.priorityLight as 'GREEN' | 'YELLOW' | 'RED',
        status: formData.status as 'ACTIVE' | 'ARCHIVED',
        supportingSpecialists: supportingIds.map((id) => parseInt(id)),
      };

      if (canManageOwner) {
        data.owner = ownerId ? parseInt(ownerId) : undefined;
      } else if (!project && ownerId) {
        data.owner = parseInt(ownerId);
      }

      if (project) {
        await projectsApi.update(project.documentId, data);
      } else {
        await projectsApi.create(data);
      }

      onSuccess();
    } catch (err) {
      setError('Ошибка сохранения проекта');
    } finally {
      setIsLoading(false);
    }
  };

  const getDepartmentName = (dept: { name_ru: string; name_kz: string }) => {
    return i18n.language === 'kz' ? dept.name_kz : dept.name_ru;
  };

  const selectedDepartmentName = selectedDepartment ? getDepartmentName(selectedDepartment) : '';
  const ownerScopeHint = isSuperAdmin
    ? t('project.ownerAnyDepartment')
    : t('project.ownerSameDepartment');
  const ownerPermissionHint = t('project.ownerSectionHint');

  const getUserLabel = (assignee: { username: string; firstName?: string; lastName?: string }) => {
    const fullName = `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim();
    if (fullName) return fullName;
    return assignee.username;
  };

  const departmentSource =
    departments.length > 0 ? departments : user?.department ? [user.department] : [];

  const assigneeDepartmentOptions = departmentSource.map((d) => ({
    value: d.key,
    label: getDepartmentName(d),
  }));

  const ownerCandidates = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    assignableUsers.forEach((assignee) => {
      map.set(assignee.id.toString(), assignee);
    });
    if (project?.owner && !map.has(project.owner.id.toString())) {
      map.set(project.owner.id.toString(), project.owner);
    }
    if (user && !map.has(user.id.toString())) {
      map.set(user.id.toString(), user);
    }
    return Array.from(map.values());
  }, [assignableUsers, project?.owner, user]);

  const ownerOptions = useMemo(
    () =>
      ownerCandidates.map((assignee) => ({
        value: assignee.id.toString(),
        label: getUserLabel(assignee),
      })),
    [ownerCandidates]
  );

  const selectedOwner = useMemo(() => {
    return ownerCandidates.find((assignee) => assignee.id.toString() === ownerId) || null;
  }, [ownerCandidates, ownerId]);

  const ownerDepartmentKey = selectedOwner?.department?.key || null;
  const ownerDepartmentMismatch = Boolean(
    !isSuperAdmin &&
      selectedDepartmentKey &&
      ownerDepartmentKey &&
      ownerDepartmentKey !== selectedDepartmentKey
  );

  useEffect(() => {
    if (!ownerError) return;
    if (!ownerDepartmentMismatch && !departmentMismatchWithUser) {
      setOwnerError('');
    }
  }, [departmentMismatchWithUser, ownerDepartmentMismatch, ownerError]);

  const supportingPool = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    assignableUsers.forEach((assignee) => {
      map.set(assignee.id.toString(), assignee);
    });
    project?.supportingSpecialists?.forEach((assignee) => {
      if (!map.has(assignee.id.toString())) {
        map.set(assignee.id.toString(), assignee);
      }
    });
    return Array.from(map.values());
  }, [assignableUsers, project?.supportingSpecialists]);

  const supportingOptions = useMemo(() => {
    return supportingPool.filter((assignee) => assignee.id.toString() !== ownerId);
  }, [supportingPool, ownerId]);

  const displayOwner = selectedOwner || project?.owner || user || null;

  const priorityOptions = [
    { value: 'GREEN', label: t('priority.GREEN') },
    { value: 'YELLOW', label: t('priority.YELLOW') },
    { value: 'RED', label: t('priority.RED') },
  ];

  const statusOptions = [
    { value: 'ACTIVE', label: t('status.ACTIVE') },
    { value: 'ARCHIVED', label: t('status.ARCHIVED') },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={project ? t('project.editProject') : t('project.createProject')}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full -m-4">
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Input
          label={t('project.title')}
          value={formData.title}
          onChange={handleChange('title')}
          required
          placeholder="Название проекта"
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t('project.description')}
          </label>
          <textarea
            value={formData.description}
            onChange={handleChange('description')}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Описание проекта..."
          />
        </div>

        <Select
          label={t('project.assigneeDepartment')}
          value={assigneeDepartment}
          onChange={(e) => setAssigneeDepartment(e.target.value)}
          options={assigneeDepartmentOptions}
          placeholder={isSuperAdmin ? t('common.all') : undefined}
          disabled={!isSuperAdmin}
        />
        {!isSuperAdmin && selectedDepartmentName && (
          <p className="text-xs text-slate-500">{selectedDepartmentName}</p>
        )}

        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-primary-600">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{t('project.ownerSection')}</h3>
                {selectedDepartmentName && (
                  <span className="text-xs text-slate-500">
                    {t('project.assigneeDepartment')}: {selectedDepartmentName}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{ownerPermissionHint}</p>
            </div>
          </div>

          {canManageOwner ? (
            <Select
              label={t('project.owner')}
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                if (ownerError) setOwnerError('');
              }}
              options={ownerOptions}
              placeholder={t('project.ownerPlaceholder')}
              error={ownerError}
            />
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                {t('project.owner')}
              </label>
              <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                {displayOwner ? getUserLabel(displayOwner) : t('project.ownerNotAssigned')}
              </div>
            </div>
          )}

          {(ownerDepartmentMismatch || departmentMismatchWithUser) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{t('project.ownerDepartmentMismatch')}</span>
            </div>
          )}

          {!ownerDepartmentMismatch && !departmentMismatchWithUser && (
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <span>{ownerScopeHint}</span>
            </div>
          )}
        </section>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            {t('project.supportingSpecialists')}
          </label>
          {isUsersLoading ? (
            <div className="text-sm text-slate-500">{t('common.loading')}</div>
          ) : (
            <div className="space-y-2">
              {usersError && <div className="text-sm text-red-600">{usersError}</div>}
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                {supportingOptions.length === 0 ? (
                  <div className="text-sm text-slate-500">{t('project.noAssignableUsers')}</div>
                ) : (
                  supportingOptions.map((assignee) => (
                    <label key={assignee.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={supportingIds.includes(assignee.id.toString())}
                        onChange={(e) => {
                          const value = assignee.id.toString();
                          setSupportingIds((prev) =>
                            e.target.checked ? [...prev, value] : prev.filter((id) => id !== value)
                          );
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      {getUserLabel(assignee)}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">{t('project.supportingSpecialistsHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            type="date"
            label={t('project.startDate')}
            value={formData.startDate}
            onChange={handleChange('startDate')}
            error={dateErrors.startDate}
            required
          />
          <Input
            type="date"
            label={t('project.dueDate')}
            value={formData.dueDate}
            onChange={handleChange('dueDate')}
            error={dateErrors.dueDate}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t('project.priority')}
            value={formData.priorityLight}
            onChange={handleChange('priorityLight')}
            options={priorityOptions}
          />
          <Select
            label={t('project.status')}
            value={formData.status}
            onChange={handleChange('status')}
            options={statusOptions}
          />
        </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-slate-100 flex-shrink-0 bg-white">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isLoading}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
