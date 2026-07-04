import { AlertTriangle } from 'lucide-react';

const CHAIN_LABELS: Record<string, string> = {
  refinement: 'Refinement',
  challenge: 'Challenge',
  decomposition: 'Decomposition',
  pivot: 'Pivot',
  loop: 'Loop',
  acceptance: 'Wrap-up',
  new_topic: 'New topic',
};

const LOOP_EXPLANATION =
  'You sent similar prompts without significantly changing your approach. ' +
  "Try questioning the AI's reasoning or reformulating your request to break the pattern.";

interface Chain {
  id: string;
  chain_type: string | null;
  prompt_count: number | null;
  structure_score_trend: string | null;
  resolution_type: string | null;
  first_occurrence_for_participant: boolean | null;
}

interface ChainTimelineProps {
  chains: Chain[];
}

/**
 * Renders a horizontal timeline of prompt chains for a receipt.
 * Loop chains are flagged with an amber warning and explanation.
 * Participant-visible only — no researcher-specific data shown.
 * Used by: src/components/receipt/LiteracyReceipt.tsx
 */
export function ChainTimeline({ chains }: ChainTimelineProps) {
  if (!chains.length) return null;

  const totalPrompts = chains.reduce((sum, c) => sum + (c.prompt_count ?? 1), 0);
  const hasLoops = chains.some(c => c.chain_type === 'loop');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
        How you worked in this session
      </h3>

      <div className="flex w-full gap-1.5">
        {chains.map((chain) => {
          const isLoop = chain.chain_type === 'loop';
          const widthPct = totalPrompts > 0
            ? Math.max(8, ((chain.prompt_count ?? 1) / totalPrompts) * 100)
            : 100 / chains.length;
          const label = CHAIN_LABELS[chain.chain_type ?? ''] ?? chain.chain_type ?? 'Unknown';

          return (
            <div
              key={chain.id}
              className={
                'rounded-md border px-2 py-1.5 flex items-center gap-1.5 min-w-0 ' +
                (isLoop
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-border bg-muted/40 text-muted-foreground')
              }
              style={{ width: `${widthPct}%` }}
              title={label}
            >
              {isLoop && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              <span className="text-xs font-medium truncate">{label}</span>
              {(chain.prompt_count ?? 0) > 1 && (
                <span className="ml-auto text-[10px] tabular-nums opacity-70 shrink-0">
                  {chain.prompt_count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {hasLoops && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {LOOP_EXPLANATION}
          </p>
        </div>
      )}
    </div>
  );
}
