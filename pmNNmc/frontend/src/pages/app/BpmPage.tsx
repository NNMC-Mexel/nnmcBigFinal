import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';

type BpmNode = {
  id: string;
  title: string;
  icon?: LucideIcon;
  status?: 'ready' | 'draft';
  count?: number;
  to?: string;
  children?: BpmNode[];
};

const companyArchive = (id: string): BpmNode[] => [
  {
    id: `${id}-archive`,
    title: 'Архив',
    icon: Archive,
    children: [
      {
        id: `${id}-archive-2025`,
        title: '2025',
        icon: Folder,
        children: [
          { id: `${id}-archive-2025-nnmc`, title: 'ННМЦ', icon: Folder },
          { id: `${id}-archive-2025-mexel`, title: 'Mexel', icon: Folder },
        ],
      },
      {
        id: `${id}-archive-2026`,
        title: '2026',
        icon: Folder,
        children: [
          { id: `${id}-archive-2026-nnmc`, title: 'ННМЦ', icon: Folder },
          { id: `${id}-archive-2026-mexel`, title: 'Mexel', icon: Folder },
        ],
      },
    ],
  },
];

const processNode = (id: string, title: string, icon: LucideIcon = FileText): BpmNode => ({
  id,
  title,
  icon,
  status: 'draft',
  children: [
    { id: `${id}-new`, title: 'Новые', icon: FileText },
    { id: `${id}-approval`, title: 'Согласование', icon: CheckCircle2 },
    { id: `${id}-execution`, title: 'Исполнение', icon: Clock3 },
    ...companyArchive(id),
  ],
});

const bpmTree: BpmNode[] = [
  {
    id: 'my-tasks',
    title: 'Мои задачи',
    icon: CheckCircle2,
    count: 2,
    children: [
      { id: 'my-tasks-active', title: 'Активные', icon: Clock3, count: 2 },
      { id: 'my-tasks-done', title: 'Завершенные', icon: CheckCircle2 },
    ],
  },
  {
    id: 'hr',
    title: 'Управление персоналом',
    icon: Users,
    children: [
      { id: 'hr-employees', title: 'Сотрудники', icon: Users, status: 'ready', to: '/app/bpm/employees' },
      processNode('hr-personal-file', 'Личное дело', FileText),
      processNode('hr-sick-leave', 'Больничный лист', FileCheck2),
      processNode('hr-workplace-certificate', 'Справка с места работы', FileText),
      processNode('hr-duty-schedule', 'График дежурств', CalendarDays),
      processNode('hr-additional-agreement', 'Доп. соглашения', FileCheck2),
      {
        id: 'hr-access',
        title: 'Допуск и отстранение от работы',
        icon: Briefcase,
        children: [
          processNode('hr-access-allow', 'Допуск к работе', Briefcase),
          processNode('hr-access-suspend', 'Отстранение от работы', UserMinus),
        ],
      },
      processNode('hr-business-trip', 'Командировка', Briefcase),
      {
        id: 'hr-education',
        title: 'Обучение',
        icon: GraduationCap,
        children: [
          processNode('hr-education-plan', 'План обучения', GraduationCap),
          processNode('hr-education-order', 'Приказ на обучение', FileCheck2),
        ],
      },
      {
        id: 'hr-vacation',
        title: 'Отпуск',
        icon: CalendarDays,
        children: [
          processNode('hr-vacation-request', 'Заявка на отпуск', CalendarDays),
          processNode('hr-vacation-calendar', 'Календарь отпусков', CalendarDays),
          processNode('hr-vacation-schedule', 'Графики отпусков', CalendarDays),
          processNode('hr-vacation-review', 'Отзыв с отпуска', FileText),
        ],
      },
      processNode('hr-transfer', 'Перевод сотрудника', Users),
      {
        id: 'hr-hiring',
        title: 'Прием на работу',
        icon: UserPlus,
        children: [
          processNode('hr-hiring-application', 'Заявление о приеме на работу', UserPlus),
          processNode('hr-hiring-order', 'Приказ о приеме на работу', FileCheck2),
          processNode('hr-hiring-contract', 'Трудовой договор', FileText),
        ],
      },
      processNode('hr-personnel-orders', 'Произвольные кадровые приказы', FileCheck2),
      processNode('hr-holiday-work', 'Работа в выходной день', CalendarDays),
      processNode('hr-overtime', 'Сверхурочные', Clock3),
      processNode('hr-memo', 'Служебная записка', FileText),
      processNode('hr-combination', 'Совмещение должностей', Briefcase),
      {
        id: 'hr-dismissal',
        title: 'Увольнение',
        icon: UserMinus,
        children: [
          processNode('hr-dismissal-application', 'Заявление на увольнение', UserMinus),
          processNode('hr-dismissal-clearance', 'Обходной лист', FileCheck2),
          processNode('hr-dismissal-order', 'Приказ о расторжении', FileCheck2),
          processNode('hr-dismissal-notice', 'Уведомление', FileText),
        ],
      },
    ],
  },
  {
    id: 'instructions',
    title: 'Инструкция',
    icon: Settings2,
    children: [
      { id: 'instructions-regulations', title: 'Регламенты', icon: FileText },
      { id: 'instructions-templates', title: 'Шаблоны документов', icon: FileText },
    ],
  },
  { id: 'trash', title: 'Корзина', icon: Trash2 },
];

const initialExpanded = new Set(['my-tasks', 'it', 'hr', 'hr-vacation', 'hr-hiring', 'hr-dismissal']);

const flattenNodes = (nodes: BpmNode[]): BpmNode[] =>
  nodes.flatMap((node) => [node, ...(node.children ? flattenNodes(node.children) : [])]);

const getChildCount = (node?: BpmNode) => {
  if (!node?.children) return 0;
  return flattenNodes(node.children).length;
};

const getTreeLevelStyle = (depth: number, isSelected: boolean) => {
  if (depth === 0) {
    return {
      button: isSelected
        ? 'bg-slate-900 text-white shadow-sm'
        : 'bg-slate-800 text-white hover:bg-slate-900',
      icon: 'text-white',
      toggle: 'text-slate-200',
      count: 'bg-white/15 text-white',
      text: 'font-bold',
    };
  }
  if (depth === 1) {
    return {
      button: isSelected
        ? 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200'
        : 'text-emerald-900 hover:bg-emerald-50',
      icon: isSelected ? 'text-emerald-700' : 'text-emerald-600',
      toggle: 'text-emerald-500',
      count: 'bg-emerald-100 text-emerald-700',
      text: 'font-semibold',
    };
  }
  if (depth === 2) {
    return {
      button: isSelected
        ? 'bg-indigo-100 text-indigo-950 ring-1 ring-indigo-200'
        : 'text-indigo-900 hover:bg-indigo-50',
      icon: isSelected ? 'text-indigo-700' : 'text-indigo-500',
      toggle: 'text-indigo-400',
      count: 'bg-indigo-100 text-indigo-700',
      text: 'font-semibold',
    };
  }
  return {
    button: isSelected
      ? 'bg-sky-100 text-sky-950 ring-1 ring-sky-200'
      : 'text-slate-700 hover:bg-sky-50 hover:text-slate-950',
    icon: isSelected ? 'text-sky-700' : 'text-sky-500',
    toggle: 'text-sky-400',
    count: 'bg-sky-100 text-sky-700',
    text: 'font-medium',
  };
};

function TreeItem({
  node,
  depth,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  node: BpmNode;
  depth: number;
  selectedId: string;
  expanded: Set<string>;
  onSelect: (node: BpmNode) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const Icon = node.icon || (hasChildren ? Folder : FileText);
  const levelStyle = getTreeLevelStyle(depth, isSelected);

  return (
    <div className={depth === 0 ? 'mb-1.5' : 'mb-0.5'}>
      <button
        type="button"
        className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[15px] leading-5 transition ${levelStyle.button}`}
        style={{ paddingLeft: `${10 + depth * 20}px` }}
        onClick={() => {
          onSelect(node);
          if (hasChildren) onToggle(node.id);
        }}
      >
        <span className={`flex h-5 w-5 items-center justify-center ${levelStyle.toggle}`}>
          {hasChildren ? (
            isOpen ? <ChevronDown className="h-5 w-5 stroke-[2.4]" /> : <ChevronRight className="h-5 w-5 stroke-[2.4]" />
          ) : null}
        </span>
        <Icon className={`h-5 w-5 shrink-0 stroke-[2.35] ${levelStyle.icon}`} />
        <span className={`min-w-0 flex-1 truncate ${levelStyle.text}`}>{node.title}</span>
        {node.count ? (
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${levelStyle.count}`}>
            {node.count}
          </span>
        ) : null}
      </button>
      {hasChildren && isOpen ? (
        <div className="mt-0.5">
          {node.children?.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function BpmPage() {
  const [selectedId, setSelectedId] = useState('hr');
  const [expanded, setExpanded] = useState(initialExpanded);
  const nodes = useMemo(() => flattenNodes(bpmTree), []);
  const expandableIds = useMemo(() => nodes.filter((node) => node.children?.length).map((node) => node.id), [nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedId) || bpmTree[0];
  const selectedChildren = selectedNode.children || [];
  const SelectedIcon = selectedNode.icon || FolderOpen;

  const toggleNode = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectNode = (node: BpmNode) => {
    setSelectedId(node.id);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-teal-600">BPM</p>
          <h1 className="text-2xl font-bold text-slate-900">Корпоративные процессы</h1>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <p className="text-xs text-slate-500">Задачи</p>
            <p className="text-lg font-bold text-slate-900">2</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <p className="text-xs text-slate-500">Процессы</p>
            <p className="text-lg font-bold text-slate-900">31</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <p className="text-xs text-slate-500">Разделы</p>
            <p className="text-lg font-bold text-slate-900">5</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Мои задачи</h2>
              <p className="text-sm text-slate-500">Реестр процессов</p>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-slate-50 p-1">
              <button
                className="rounded bg-white px-2.5 py-1 text-sm font-bold text-slate-600 shadow-sm"
                type="button"
                onClick={() => setExpanded(new Set())}
              >
                -
              </button>
              <button
                className="rounded bg-white px-2.5 py-1 text-sm font-bold text-slate-600 shadow-sm"
                type="button"
                onClick={() => setExpanded(new Set(expandableIds))}
              >
                +
              </button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-250px)] min-h-[560px] overflow-auto p-3">
            {bpmTree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={selectNode}
                onToggle={toggleNode}
              />
            ))}
          </div>
        </aside>

        <main className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <SelectedIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-teal-600">BPM / {selectedNode.id}</p>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedNode.title}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Вложенных разделов: {getChildCount(selectedNode)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedNode.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {selectedNode.status === 'ready' ? 'Работает' : 'Черновик'}
                    </span>
                  </div>
                </div>
              </div>
              {selectedNode.to ? (
                <Link
                  to={selectedNode.to}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
                >
                  Открыть модуль
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500"
                >
                  Новая заявка
                </button>
              )}
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid min-w-[760px] grid-cols-[1.4fr_170px_150px_120px] border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-500">
              <span>Название</span>
              <span>Тип</span>
              <span>Состояние</span>
              <span>Год</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(selectedChildren.length ? selectedChildren : companyArchive(`${selectedNode.id}-empty`)).map((child) => {
                const ChildIcon = child.icon || FileText;
                return (
                  <button
                    type="button"
                    key={child.id}
                    className="grid min-w-[760px] w-full grid-cols-[1.4fr_170px_150px_120px] items-center px-4 py-3.5 text-left text-[15px] transition hover:bg-slate-50"
                    onClick={() => selectNode(child)}
                  >
                    <span className="flex min-w-0 items-center gap-3 font-semibold text-slate-800">
                      <ChildIcon className="h-5 w-5 shrink-0 stroke-[2.35] text-slate-500" />
                      <span className="truncate">{child.title}</span>
                    </span>
                    <span className="text-slate-500">{child.children?.length ? 'Папка' : 'Документ'}</span>
                    <span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                        {child.status === 'ready' ? 'Работает' : 'Черновик'}
                      </span>
                    </span>
                    <span className="text-slate-500">2026</span>
                  </button>
                );
              })}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
