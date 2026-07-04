import type { TimePeriod, BgMode } from './webTypes';

interface Props { value: TimePeriod; onChange: (period: TimePeriod) => void; bgMode?: BgMode; }

const OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'session', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All Time' },
];

export function WebTimelineFilter({ value, onChange, bgMode = 'dark' }: Props) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  const containerCls = isBlueprint ? 'bg-[hsl(220_30%_9%)] border-[hsl(200_40%_20%)] rounded-none'
    : isDark ? 'bg-[hsl(220_30%_12%)] border-[hsl(220_30%_20%)] rounded-full'
    : 'bg-[hsl(220_20%_88%)] border-[hsl(220_20%_78%)] rounded-full';
  return (
    <div className={`flex gap-1.5 p-1.5 border ${containerCls}`}>
      {OPTIONS.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-all ${
            isBlueprint ? 'rounded-none font-mono uppercase tracking-wider' : 'rounded-full'
          } ${value === opt.value ? 'bg-primary/20 text-primary shadow-sm'
            : isBlueprint ? 'text-[hsl(200_40%_45%)] hover:text-[hsl(200_60%_65%)]'
            : isDark ? 'text-[hsl(220_20%_55%)] hover:text-[hsl(220_20%_75%)]'
            : 'text-[hsl(220_20%_45%)] hover:text-[hsl(220_20%_20%)]'
          }`}>
          {isBlueprint ? opt.label.toUpperCase() : opt.label}
        </button>
      ))}
    </div>
  );
}
