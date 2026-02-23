import { useTranslation } from 'react-i18next';

interface PriorityLightProps {
  priority: 'GREEN' | 'YELLOW' | 'RED';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function PriorityLight({ 
  priority, 
  showLabel = false,
  size = 'md' 
}: PriorityLightProps) {
  const { t } = useTranslation();

  const colors = {
    GREEN: 'bg-green-500',
    YELLOW: 'bg-yellow-400',
    RED: 'bg-red-500',
  };

  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const pulseClass = priority === 'RED' ? 'animate-pulse' : '';

  return (
    <div className="flex items-center gap-2">
      <span 
        className={`${sizes[size]} rounded-full ${colors[priority]} ${pulseClass}`}
        title={t(`priority.${priority}`)}
      />
      {showLabel && (
        <span className="text-sm text-slate-600">{t(`priority.${priority}`)}</span>
      )}
    </div>
  );
}
