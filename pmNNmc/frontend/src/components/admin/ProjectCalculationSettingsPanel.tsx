import { useEffect, useMemo, useState } from 'react';
import { Calculator, RefreshCw, Save, Search } from 'lucide-react';
import {
  projectCalculationsApi,
  ProjectCalculationSettings,
  UserCalculationAccessRule,
} from '../../api/projectCalculations';
import Button from '../ui/Button';
import Loader from '../ui/Loader';

const DEFAULT_ACTUAL_FORMULA = '(market - actual) * margin / employeeCount';
const DEFAULT_AI_FORMULA = '(market - ai) * margin / employeeCount';

function userLabel(user: any) {
  return `${user.lastName || ''} ${user.firstName || ''}`.trim() || user.username || user.email;
}

export default function ProjectCalculationSettingsPanel() {
  const [settings, setSettings] = useState<ProjectCalculationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSettings(await projectCalculationsApi.getSettings());
    } catch (requestError: any) {
      setError(requestError.response?.data?.error?.message || 'Не удалось загрузить настройки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const departmentSettings = useMemo(() => {
    if (!settings) return [];
    const map = new Map(settings.departmentSettings.map((item) => [Number(item.departmentId), item]));
    return settings.departments.map((department) => map.get(Number(department.id)) || {
      departmentId: Number(department.id),
      enabled: false,
      code: department.key || 'DEP',
      hourlyRate: 0,
    });
  }, [settings]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!settings || !term) return settings?.users || [];
    return settings.users.filter((user) =>
      `${userLabel(user)} ${user.email || ''} ${user.username || ''} ${user.department?.name_ru || ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [settings, search]);

  const updateDepartment = (departmentId: number, patch: Record<string, unknown>) => {
    if (!settings) return;
    const existing = new Map(departmentSettings.map((item) => [Number(item.departmentId), item]));
    existing.set(departmentId, { ...existing.get(departmentId)!, ...patch });
    setSettings({ ...settings, departmentSettings: Array.from(existing.values()) });
  };

  const updateUserRule = (userId: number, field: 'canCreate' | 'canViewDepartment', checked: boolean) => {
    if (!settings) return;
    const rules = new Map<number, UserCalculationAccessRule>(
      settings.userAccessRules.map((rule) => [Number(rule.userId), rule])
    );
    const next = { userId, canCreate: false, canViewDepartment: false, ...(rules.get(userId) || {}), [field]: checked };
    if (!next.canCreate && !next.canViewDepartment) rules.delete(userId);
    else rules.set(userId, next);
    setSettings({ ...settings, userAccessRules: Array.from(rules.values()) });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      await projectCalculationsApi.updateSettings({
        reviewerEmail: settings.reviewerEmail,
        margin: Number(settings.margin),
        actualFormula: settings.actualFormula,
        aiFormula: settings.aiFormula,
        departmentSettings,
        userAccessRules: settings.userAccessRules,
      });
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.error?.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) return <Loader text="Загрузка настроек расчёта проектов..." />;
  if (!settings) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error || 'Настройки недоступны'}</div>;

  const rules = new Map(settings.userAccessRules.map((rule) => [Number(rule.userId), rule]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-slate-800">Расчёт проектов</h2>
            <p className="text-sm text-slate-500">Доступы, ставки и закрытые правила расчёта</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} disabled={saving} icon={<RefreshCw className="h-4 w-4" />}>Обновить</Button>
          <Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Сохранить</Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="border-y border-slate-200 py-5">
        <h3 className="mb-4 font-semibold text-slate-800">Согласование и формулы</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm text-slate-700">
            Email согласующего
            <input
              type="email"
              value={settings.reviewerEmail || ''}
              onChange={(event) => setSettings({ ...settings, reviewerEmail: event.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="text-sm text-slate-700">
            Маржа, коэффициент от 0 до 1
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={settings.margin ?? 0.3}
              onChange={(event) => setSettings({ ...settings, margin: Number(event.target.value) })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="text-sm text-slate-700">
            Формула по фактической оценке
            <input
              value={settings.actualFormula || DEFAULT_ACTUAL_FORMULA}
              onChange={(event) => setSettings({ ...settings, actualFormula: event.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="text-sm text-slate-700">
            Формула по оценке ИИ
            <input
              value={settings.aiFormula || DEFAULT_AI_FORMULA}
              onChange={(event) => setSettings({ ...settings, aiFormula: event.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Переменные: market, actual, ai, margin, employeeCount. Формулы не передаются обычным пользователям.</p>
      </section>

      <section>
        <h3 className="mb-3 font-semibold text-slate-800">Подразделения и стоимость часа</h3>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Доступ</th>
                <th className="px-3 py-2 font-medium">Подразделение</th>
                <th className="px-3 py-2 font-medium">Код в номере</th>
                <th className="px-3 py-2 font-medium">Стоимость часа, ₸</th>
              </tr>
            </thead>
            <tbody>
              {settings.departments.map((department) => {
                const row = departmentSettings.find((item) => Number(item.departmentId) === Number(department.id))!;
                return (
                  <tr key={department.id} className="border-t border-slate-100">
                    <td className="px-3 py-2"><input type="checkbox" checked={row.enabled} onChange={(event) => updateDepartment(department.id, { enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /></td>
                    <td className="px-3 py-2 font-medium text-slate-700">{department.name_ru}</td>
                    <td className="px-3 py-2"><input value={row.code} onChange={(event) => updateDepartment(department.id, { code: event.target.value.toUpperCase() })} className="w-28 rounded-md border border-slate-300 px-2 py-1.5 font-mono" /></td>
                    <td className="px-3 py-2"><input type="number" min="0" step="1" value={row.hourlyRate} onChange={(event) => updateDepartment(department.id, { hourlyRate: Number(event.target.value) })} className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-right" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-slate-200 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">Индивидуальные права</h3>
            <p className="text-sm text-slate-500">Дополнение к доступу подразделения</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ФИО, email или отдел" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>
        <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr><th className="px-3 py-2 font-medium">Пользователь</th><th className="px-3 py-2 text-center font-medium">Создание</th><th className="px-3 py-2 text-center font-medium">Весь отдел</th></tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const rule = rules.get(Number(user.id));
                return (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="px-3 py-2"><div className="font-medium text-slate-700">{userLabel(user)}</div><div className="text-xs text-slate-400">{user.email} · {user.department?.name_ru || 'Без отдела'}</div></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={Boolean(rule?.canCreate)} onChange={(event) => updateUserRule(user.id, 'canCreate', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={Boolean(rule?.canViewDepartment)} onChange={(event) => updateUserRule(user.id, 'canViewDepartment', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
