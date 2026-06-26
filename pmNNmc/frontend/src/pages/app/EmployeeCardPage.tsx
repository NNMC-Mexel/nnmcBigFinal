import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Hash,
  User,
  Wallet,
} from 'lucide-react';
import { employeeCardsApi, type EmployeeCard } from '../../api/employeeCards';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatMoney(value?: number): string {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || '—'}</p>
    </div>
  );
}

export default function EmployeeCardPage() {
  const { id } = useParams();
  const [card, setCard] = useState<EmployeeCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const response = await employeeCardsApi.get(id);
      setCard(response);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || requestError?.message || 'Не удалось загрузить карточку сотрудника');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Загрузка карточки сотрудника...
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="space-y-4">
        <Link to="/app/bpm/employees" className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Назад к сотрудникам
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Карточка сотрудника не найдена'}
        </div>
      </div>
    );
  }

  const primary = card.primaryWorkplace;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/app/bpm/employees" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Назад к сотрудникам
          </Link>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">BPM · Карточка сотрудника</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{card.fio}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Одна карточка по ИИН. Все табельные номера и рабочие места загружаются из 1С.
          </p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
          card.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}>
          {card.active ? 'Активный сотрудник' : 'Неактивный сотрудник'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoItem label="ИИН" value={card.iin} />
        <InfoItem label="Дата рождения" value={formatDate(card.birthDate)} />
        <InfoItem label="Пол" value={card.gender} />
        <InfoItem label="Национальность" value={card.nationality} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-900">Личные данные</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoItem label="Фамилия" value={card.lastName} />
            <InfoItem label="Имя" value={card.firstName} />
            <InfoItem label="Отчество" value={card.middleName} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Hash className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-900">Основное место</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-semibold">{primary?.department || 'Подразделение не указано'}</p>
            <p>{primary?.position || 'Должность не указана'}</p>
            <p>Таб. № {primary?.personnelNumber || '—'}</p>
            <p>Оклад: {formatMoney(primary?.salary)} ₸</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-900">Рабочие места и табельные номера</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {card.workplaces.length} мест
          </span>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {card.workplaces.map((workplace, index) => (
            <div key={workplace.employeeId || index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Hash className="h-4 w-4 text-teal-600" />
                  Таб. № {workplace.personnelNumber || '—'}
                </div>
                {workplace.primary && (
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                    Основное место
                  </span>
                )}
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <p className="flex gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {workplace.department || 'Подразделение не указано'}
                </p>
                <p className="flex gap-2">
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {workplace.position || 'Должность не указана'} · {workplace.employmentType || 'Вид занятости не указан'} · {workplace.rate} ставки
                </p>
                <p className="flex gap-2">
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  Оклад: {formatMoney(workplace.salary)} ₸ · ФОТ: {formatMoney(workplace.payroll)} ₸
                </p>
                <p className="flex gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  Приём: {formatDate(workplace.hireDate)} · Увольнение: {formatDate(workplace.dismissalDate)}
                </p>
                <p>График: {workplace.schedule || '—'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
