interface Props {
  summary?: string | null;
  seed: string;
  className?: string;
  truncate?: boolean;
}

// 8 muted bone/Charlotte-Labs tints. Inline styles so we don't depend on tailwind safelist.
const TINTS: { bg: string; fg: string; border: string }[] = [
  { bg: "hsl(155 30% 90%)", fg: "hsl(155 35% 25%)", border: "hsl(155 30% 75%)" }, // sage
  { bg: "hsl(20 45% 90%)",  fg: "hsl(20 50% 30%)",  border: "hsl(20 45% 75%)"  }, // clay
  { bg: "hsl(200 40% 90%)", fg: "hsl(200 50% 25%)", border: "hsl(200 40% 75%)" }, // ocean
  { bg: "hsl(40 50% 88%)",  fg: "hsl(35 50% 28%)",  border: "hsl(40 45% 72%)"  }, // sand
  { bg: "hsl(340 35% 92%)", fg: "hsl(340 40% 32%)", border: "hsl(340 30% 78%)" }, // blush
  { bg: "hsl(220 20% 90%)", fg: "hsl(220 25% 28%)", border: "hsl(220 18% 75%)" }, // slate
  { bg: "hsl(45 60% 88%)",  fg: "hsl(35 55% 28%)",  border: "hsl(45 55% 72%)"  }, // amber
  { bg: "hsl(170 35% 88%)", fg: "hsl(170 40% 25%)", border: "hsl(170 35% 72%)" }, // mint
];

function pickTint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function ThreadSummaryChip({ summary, seed, className = "", truncate = true }: Props) {
  const tint = pickTint(seed);

  if (!summary) {
    return (
      <span
        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs italic text-muted-foreground animate-pulse ${className}`}
        style={{ background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}
      >
        Generating summary…
      </span>
    );
  }

  return (
    <span
      title={summary}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${truncate ? "max-w-full truncate" : ""} ${className}`}
      style={{ background: tint.bg, color: tint.fg, borderColor: tint.border }}
    >
      {summary}
    </span>
  );
}
