import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FolderKanban,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Clock,
  TrendingUp,
  Building2,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { useUserRole } from '../../store/authStore';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Loader from '../../components/ui/Loader';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { summary, isLoading, fetchSummary, currentDepartment } = useAnalyticsStore();
  const { isAdmin, isLead, userDepartment, departmentKey } = useUserRole();

  useEffect(() => {
    // Руководители видят всё, обычные пользователи - только свой отдел
    if (isAdmin || isLead) {
      fetchSummary(); // без фильтра - все данные
    } else if (departmentKey) {
      fetchSummary(departmentKey); // только свой отдел
    }
  }, [fetchSummary, isAdmin, isLead, departmentKey]);

  // Навигация в таблицу с фильтрами
  const navigateToTable = (filter?: string) => {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') {
      params.set('filter', filter);
      // Для обычных пользователей добавляем фильтр по отделу (кроме "Всего проектов")
      if (!isAdmin && !isLead && departmentKey) {
        params.set('department', departmentKey);
      }
    }
    // "Всего проектов" (filter === 'all') - показываем все проекты без фильтра по отделу
    navigate(`/app/table?${params.toString()}`);
  };

  if (isLoading && !summary) {
    return <Loader text={t('common.loading')} />;
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-slate-500">
        Не удалось загрузить аналитику
      </div>
    );
  }

  const { totals, byDepartment, byPriority, weeklyCreated, weeklyArchived } = summary;

  // KPI cards data
  const kpiCards = [
    {
      label: t('dashboard.totalProjects'),
      value: totals.total,
      icon: FolderKanban,
      color: 'from-slate-500 to-slate-700',
      bgColor: 'bg-slate-50',
      filter: 'all',
    },
    {
      label: t('dashboard.activeProjects'),
      value: totals.active,
      icon: CheckCircle2,
      color: 'from-primary-500 to-primary-700',
      bgColor: 'bg-primary-50',
      filter: 'active',
    },
    {
      label: t('dashboard.archivedProjects'),
      value: totals.archived,
      icon: Archive,
      color: 'from-medical-500 to-medical-700',
      bgColor: 'bg-medical-50',
      filter: 'archived',
    },
    {
      label: t('dashboard.overdueProjects'),
      value: totals.overdue,
      icon: AlertTriangle,
      color: 'from-red-500 to-red-700',
      bgColor: 'bg-red-50',
      pulse: totals.overdue > 0,
      filter: 'overdue',
    },
    {
      label: t('dashboard.dueSoonProjects'),
      value: totals.dueSoon,
      icon: Clock,
      color: 'from-amber-500 to-amber-700',
      bgColor: 'bg-amber-50',
      filter: 'dueSoon',
    },
  ];

  // Weekly trend chart data
  const weeklyLabels = weeklyCreated.map((w) => {
    const date = new Date(w.weekStart);
    return date.toLocaleDateString(i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  });

  const weeklyChartData = {
    labels: weeklyLabels,
    datasets: [
      {
        label: t('dashboard.created'),
        data: weeklyCreated.map((w) => w.count),
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: t('dashboard.completed'),
        data: weeklyArchived.map((w) => w.count),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  // Priority doughnut chart
  const priorityChartData = {
    labels: [t('dashboard.priorityRed'), t('dashboard.priorityYellow'), t('dashboard.priorityGreen')],
    datasets: [
      {
        data: [byPriority.red, byPriority.yellow, byPriority.green],
        backgroundColor: ['#ef4444', '#eab308', '#22c55e'],
        borderWidth: 0,
      },
    ],
  };

  const getDepartmentName = (key: string) => {
    if (key === 'IT') return t('department.IT');
    if (key === 'DIGITALIZATION') return t('department.DIGITALIZATION');
    return key;
  };

  const getUserDepartmentName = () => {
    if (!userDepartment) return '';
    return i18n.language === 'kz' ? userDepartment.name_kz : userDepartment.name_ru;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-800">
            {t('dashboard.title')}
          </h1>
          <p className="text-slate-500">{t('dashboard.subtitle')}</p>
        </div>
        
        {/* Показываем информацию о фильтрации */}
        {currentDepartment ? (
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-400" />
            <span className="text-slate-600">Данные отдела:</span>
            <Badge variant={currentDepartment === 'IT' ? 'it' : 'digital'}>
              {getUserDepartmentName()}
            </Badge>
          </div>
        ) : (isAdmin || isLead) && (
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary-500" />
            <span className="text-slate-600">Все отделы</span>
          </div>
        )}
      </div>

      {/* KPI Cards - кликабельные */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((card) => (
          <Card
            key={card.label}
            className={`${card.bgColor} ${card.pulse ? 'animate-pulse-subtle' : ''} cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1`}
            hover
            onClick={() => navigateToTable(card.filter)}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">{card.label}</p>
                <p className="text-3xl font-display font-bold text-slate-800">
                  {card.value}
                </p>
              </div>
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}
              >
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Weekly Trend */}
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            <h3 className="font-semibold text-slate-800">{t('dashboard.weeklyTrend')}</h3>
          </div>
          <div className="h-64">
            <Line
              data={weeklyChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      stepSize: 1,
                    },
                  },
                },
              }}
            />
          </div>
        </Card>

        {/* Priority Chart */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4">{t('dashboard.byPriority')}</h3>
          <div className="h-64 flex items-center justify-center">
            <Doughnut
              data={priorityChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                  },
                },
                cutout: '60%',
              }}
            />
          </div>
        </Card>
      </div>

      {/* Department Stats - показываем только для руководителей */}
      {(isAdmin || isLead) && byDepartment.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4">{t('dashboard.byDepartment')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
                  <th className="pb-3 font-medium">{t('project.department')}</th>
                  <th className="pb-3 font-medium text-center">{t('dashboard.totalProjects')}</th>
                  <th className="pb-3 font-medium text-center">{t('dashboard.activeProjects')}</th>
                  <th className="pb-3 font-medium text-center">{t('dashboard.archivedProjects')}</th>
                  <th className="pb-3 font-medium text-center">{t('dashboard.overdueProjects')}</th>
                  <th className="pb-3 font-medium text-center">{t('dashboard.dueSoonProjects')}</th>
                </tr>
              </thead>
              <tbody>
                {byDepartment.map((dept) => (
                  <tr key={dept.departmentKey} className="border-b border-slate-100 last:border-0">
                    <td className="py-3">
                      <span
                        className={`badge cursor-pointer hover:opacity-80 ${
                          dept.departmentKey === 'IT' ? 'badge-department-it' : 'badge-department-digital'
                        }`}
                        onClick={() => navigate(`/app/table?department=${dept.departmentKey}`)}
                      >
                        {getDepartmentName(dept.departmentKey)}
                      </span>
                    </td>
                    <td className="py-3 text-center font-medium">{dept.total}</td>
                    <td className="py-3 text-center text-primary-600">{dept.active}</td>
                    <td className="py-3 text-center text-slate-500">{dept.archived}</td>
                    <td className="py-3 text-center">
                      {dept.overdue > 0 ? (
                        <span className="text-red-600 font-medium">{dept.overdue}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {dept.dueSoon > 0 ? (
                        <span className="text-amber-600 font-medium">{dept.dueSoon}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
