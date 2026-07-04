import type { ColorByMode, WebNode, BgMode } from './webTypes';

interface Props {
  value: ColorByMode;
  onChange: (mode: ColorByMode) => void;
  nodes: WebNode[];
  bgMode?: BgMode;
}

const MODES: { value: ColorByMode; label: string }[] = [
  { value: 'medium', label: 'Medium' },
  { value: 'tool', label: 'Tool' },
  { value: 'category', label: 'Category' },
  { value: 'purpose', label: 'Purpose' },
];

function buildLegend(nodes: WebNode[]) {
  const seen = new Map<string, string>();
  nodes.filter((n) => n.type === 'receipt').forEach((n) => {
    const val = (n.metadata?.colorByValue as string) || n.label || 'Unknown';
    if (!seen.has(val) && n.color) seen.set(val, n.color);
  });
  return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, color]) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), color }));
}

export function WebColorBySelector({ value, onChange, nodes, bgMode = 'dark' }: Props) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  const legend = buildLegend(nodes);
  const labelCls = isBlueprint ? 'text-[hsl(200_40%_45%)] font-mono'
    : isDark ? 'text-[hsl(220_20%_50%)]' : 'text-[hsl(220_20%_45%)]';
  const pillBg = isBlueprint ? 'bg-[hsl(220_30%_9%)]'
    : isDark ? 'bg-[hsl(220_30%_12%)]' : 'bg-[hsl(220_20%_88%)]';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className={`text-xs uppercase tracking-wider font-semibold ${labelCls}`}>Color by</span>
      <div className={`flex items-center gap-1 p-1 ${isBlueprint ? 'rounded-none' : 'rounded-lg'} ${pillBg}`}>
        {MODES.map((m) => (
          <button key={m.value} onClick={() => onChange(m.value)}
            className={`px-3 py-1 text-xs transition-colors font-medium ${
              isBlueprint ? 'rounded-none font-mono uppercase tracking-wider' : 'rounded-md'
            } ${value === m.value ? 'bg-primary/20 text-primary'
              : isBlueprint ? 'text-[hsl(200_40%_45%)] hover:text-[hsl(200_60%_65%)]'
              : isDark ? 'text-[hsl(220_20%_55%)] hover:text-[hsl(220_20%_75%)]'
              : 'text-[hsl(220_20%_45%)] hover:text-[hsl(220_20%_20%)]'
            }`}>
            {isBlueprint ? m.label.toUpperCase() : m.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {legend.slice(0, 8).map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 ${isBlueprint ? '' : 'rounded-full'}`} style={{ background: item.color }} />
            <span className={`text-xs ${
              isBlueprint ? 'font-mono uppercase tracking-wider text-[hsl(200_40%_50%)]' : isDark ? 'text-[hsl(220_20%_55%)]' : 'text-[hsl(220_20%_40%)]'
            }`}>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
