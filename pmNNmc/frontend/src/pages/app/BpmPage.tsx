import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  LayoutTemplate,
  Route,
  Settings2,
  Users,
  Workflow,
} from 'lucide-react';

const bpmModules = [
  {
    title: 'Сотрудники',
    description: 'Карточки из 1С, подразделения, места работы и кадровая основа.',
    icon: Users,
    status: 'Работает',
    to: '/app/bpm/employees',
    ready: true,
  },
  {
    title: 'Процессы',
    description: 'Каталог корпоративных процессов и их владельцев.',
    icon: Workflow,
    status: 'Скоро',
  },
  {
    title: 'Заявки BPM',
    description: 'Единый реестр обращений, задач и служебных процессов.',
    icon: ClipboardList,
    status: 'Скоро',
  },
  {
    title: 'Формы',
    description: 'Шаблоны полей, анкеты и входные данные для процессов.',
    icon: LayoutTemplate,
    status: 'Скоро',
  },
  {
    title: 'Согласования',
    description: 'Листы согласования, исполнители, сроки и решения.',
    icon: CheckCircle2,
    status: 'Скоро',
  },
  {
    title: 'Маршруты',
    description: 'Последовательности этапов, условия переходов и роли.',
    icon: Route,
    status: 'Скоро',
  },
  {
    title: 'Документы',
    description: 'Связанные файлы, вложения и результаты исполнения.',
    icon: FileText,
    status: 'Скоро',
  },
  {
    title: 'Интеграции',
    description: '1С, Keycloak и внешние сервисы корпоративной системы.',
    icon: GitBranch,
    status: 'Скоро',
  },
  {
    title: 'Настройки BPM',
    description: 'Роли, права доступа, справочники и параметры процессов.',
    icon: Settings2,
    status: 'Скоро',
  },
];

export default function BpmPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">Бизнес-процессы</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Фундамент корпоративных процессов: сотрудники, маршруты, формы, согласования и интеграции.
          </p>
        </div>
        <Link
          to="/app/bpm/employees"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          <Users className="h-4 w-4" />
          Сотрудники
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {bpmModules.map((module) => {
          const Icon = module.icon;
          const content = (
            <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    module.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {module.status}
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-900">{module.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{module.description}</p>
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-teal-700">
                Открыть
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          );

          return module.to ? (
            <Link key={module.title} to={module.to} className="block">
              {content}
            </Link>
          ) : (
            <div key={module.title} className="block cursor-default opacity-80">
              {content}
            </div>
          );
        })}
      </section>
    </div>
  );
}
