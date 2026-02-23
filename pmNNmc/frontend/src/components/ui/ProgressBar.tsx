interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

export default function ProgressBar({
  value,
  max = 100,
  size = 'md',
  showLabel = false,
  color = 'default',
}: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colors = {
    default: 'from-primary-500 to-medical-500',
    success: 'from-green-400 to-green-600',
    warning: 'from-amber-400 to-amber-600',
    danger: 'from-red-400 to-red-600',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-slate-200 rounded-full overflow-hidden ${sizes[size]}`}>
        <div
          className={`h-full bg-gradient-to-r ${colors[color]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
}
