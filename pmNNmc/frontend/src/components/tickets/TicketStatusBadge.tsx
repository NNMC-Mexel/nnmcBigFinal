import { useTranslation } from 'react-i18next';

const STATUS_CONFIG: Record<string, { bg: string; text: string; labelKey: string }> = {
  NEW: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'helpdesk.statusNew' },
  IN_PROGRESS: { bg: 'bg-yellow-100', text: 'text-yellow-700', labelKey: 'helpdesk.statusInProgress' },
  DONE: { bg: 'bg-green-100', text: 'text-green-700', labelKey: 'helpdesk.statusDone' },
  INVALID: { bg: 'bg-red-100', text: 'text-red-700', labelKey: 'helpdesk.statusInvalid' },
};

const FALLBACK_LABELS: Record<string, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнено',
  INVALID: 'Некорректная',
};

interface Props {
  status: string;
  className?: string;
}

export default function TicketStatusBadge({ status, className = '' }: Props) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.NEW;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      {t(config.labelKey, FALLBACK_LABELS[status] || status)}
    </span>
  );
}
