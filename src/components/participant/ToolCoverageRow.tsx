import { useState } from 'react';
import { ToolLogo } from '@/components/ToolLogo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const PRIMARY_TOOLS = ['chatgpt', 'claude', 'gemini', 'copilot'] as const;
type PrimaryTool = typeof PRIMARY_TOOLS[number];

const TOOL_LABELS: Record<PrimaryTool, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  copilot: 'Copilot',
};

interface ToolHistory {
  tool: string;
  receipt_count: number;
  session_count: number;
}

interface ToolCoverageRowProps {
  history: ToolHistory[];
}

/**
 * Displays coverage state for the 4 primary AI tools.
 * Solid = ≥2 receipts, semi-transparent = 1 receipt, ghost = 0 receipts.
 * Tapping a ghost tool opens a nudge modal encouraging cross-tool use.
 * Used by: src/routes/participant.index.tsx
 */
export function ToolCoverageRow({ history }: ToolCoverageRowProps) {
  const [selectedTool, setSelectedTool] = useState<PrimaryTool | null>(null);

  const getReceiptCount = (tool: PrimaryTool): number =>
    history.find(h => h.tool === tool)?.receipt_count ?? 0;

  const allCovered = PRIMARY_TOOLS.every(t => getReceiptCount(t) >= 2);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Tool Coverage
        </h3>
        {!allCovered && (
          <span className="text-xs text-muted-foreground">
            Use more tools to complete your AI fluency picture.
          </span>
        )}
      </div>

      <div className="flex items-start justify-around gap-4 sm:justify-start sm:gap-8">
        {PRIMARY_TOOLS.map(tool => {
          const count = getReceiptCount(tool);
          const isGhost = count === 0;
          const isSemi = count === 1;
          const opacity = isGhost ? 0.25 : isSemi ? 0.5 : 1.0;

          return (
            <button
              key={tool}
              type="button"
              onClick={() => isGhost && setSelectedTool(tool)}
              disabled={!isGhost}
              className="flex flex-col items-center gap-1.5 group disabled:cursor-default"
              aria-label={
                isGhost
                  ? `Add ${TOOL_LABELS[tool]} to your fluency picture`
                  : `${TOOL_LABELS[tool]}: ${count} receipt${count !== 1 ? 's' : ''}`
              }
            >
              <div className="relative" style={{ opacity }}>
                <ToolLogo tool={tool} size={44} />
                {isGhost && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none group-hover:bg-primary/90">
                    +
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground" style={{ opacity }}>
                {TOOL_LABELS[tool]}
              </span>
            </button>
          );
        })}
      </div>

      <Dialog open={selectedTool !== null} onOpenChange={(open) => !open && setSelectedTool(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Try {selectedTool ? TOOL_LABELS[selectedTool] : ''}
            </DialogTitle>
            <DialogDescription>
              Your fluency profile only reflects the tools you've submitted receipts for.
              Try the same task in {selectedTool ? TOOL_LABELS[selectedTool] : 'this tool'} to see
              how your skills transfer — and get a fuller picture of your AI fluency.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
