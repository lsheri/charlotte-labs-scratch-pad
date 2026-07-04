import { X, ExternalLink, Network } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { WebNode, BgMode, Workflow } from './webTypes';
import { ToolLogo } from '@/components/ToolLogo';

interface Props {
  node: WebNode | null;
  workflows: Workflow[];
  workflowsByTool: Map<string, Workflow[]>;
  onClose: () => void;
  bgMode?: BgMode;
}

export function WebNodeDetailPanel({ node, workflows, workflowsByTool, onClose, bgMode = 'dark' }: Props) {
  const isDark = bgMode === 'dark';
  const isBlueprint = bgMode === 'blueprint';
  const textPrimary = isBlueprint ? 'text-[hsl(200_60%_70%)]' : isDark ? 'text-[hsl(220_20%_90%)]' : 'text-[hsl(220_20%_15%)]';
  const textSecondary = isBlueprint ? 'text-[hsl(200_40%_45%)]' : isDark ? 'text-[hsl(220_20%_55%)]' : 'text-[hsl(220_20%_50%)]';
  const textMuted = isBlueprint ? 'text-[hsl(200_30%_35%)]' : isDark ? 'text-[hsl(220_20%_40%)]' : 'text-[hsl(220_20%_60%)]';
  const textBody = isBlueprint ? 'text-[hsl(200_50%_60%)]' : isDark ? 'text-[hsl(220_20%_65%)]' : 'text-[hsl(220_20%_40%)]';
  const textLabel = isBlueprint ? 'text-[hsl(200_30%_40%)]' : isDark ? 'text-[hsl(220_20%_45%)]' : 'text-[hsl(220_20%_55%)]';
  const metricBg = isBlueprint ? 'bg-[hsl(220_30%_10%)] border-[hsl(200_40%_20%)]' : isDark ? 'bg-[hsl(220_30%_14%)] border-[hsl(220_30%_20%)]' : 'bg-[hsl(220_20%_96%)] border-[hsl(220_20%_85%)]';
  const rowBg = isBlueprint ? 'border-[hsl(200_40%_18%)]' : isDark ? 'border-[hsl(220_30%_18%)]' : 'border-[hsl(220_20%_85%)]';
  const rounding = isBlueprint ? 'rounded-none' : 'rounded-lg';
  const fontCls = isBlueprint ? 'font-mono' : '';

  if (!node) {
    return (
      <div className={`flex flex-col items-center justify-center h-full gap-3 p-6 ${textMuted} ${fontCls}`}>
        <Network className="h-10 w-10 opacity-30" />
        <p className={`text-sm text-center ${isBlueprint ? 'uppercase tracking-wider' : ''}`}>Click a node to see details</p>
      </div>
    );
  }

  const isToolNode = node.type === 'tool';
  const toolKey = isToolNode ? node.id.replace(/^tool-/, '') : null;
  const toolWorkflows = toolKey ? (workflowsByTool.get(toolKey) ?? []) : [];

  const receiptId = node.metadata?.receiptId as string | undefined;
  const receiptWorkflow = receiptId ? workflows.find((w) => w.receiptId === receiptId) : null;

  return (
    <div className={`h-full overflow-y-auto ${fontCls}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {node.type === 'tool' && <ToolLogo tool={node.label} size={24} />}
            <div className="min-w-0">
              <h3 className={`font-bold text-base truncate ${isBlueprint ? 'uppercase tracking-wider text-sm' : ''} ${textPrimary}`}>{node.label}</h3>
              <span className={`text-[10px] capitalize ${isBlueprint ? 'uppercase tracking-wide' : ''} ${textSecondary}`}>{node.type}</span>
            </div>
          </div>
          <button onClick={onClose} className={`transition-colors shrink-0 ${textSecondary}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {node.metrics?.interactionCount != null && (
          <div className={`${rounding} p-2.5 border ${metricBg} mb-4`}>
            <p className="text-xl font-bold text-primary">{node.metrics.interactionCount}</p>
            <p className={`text-[9px] mt-0.5 ${isBlueprint ? 'uppercase tracking-wider' : ''} ${textSecondary}`}>Interactions</p>
          </div>
        )}

        {isToolNode && (
          <div className="mb-4">
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${textSecondary}`}>
              Workflows with {node.label} ({toolWorkflows.length})
            </h4>
            {toolWorkflows.length === 0 ? (
              <p className={`text-xs ${textMuted}`}>No saved workflows yet for this tool.</p>
            ) : (
              <div className="space-y-2">
                {toolWorkflows.slice(0, 30).map((w) => {
                  const co = w.tools.filter((t) => t !== toolKey);
                  return (
                    <Link
                      key={w.receiptId}
                      to="/participant/receipts/$receiptId"
                      params={{ receiptId: w.receiptId }}
                      className={`block border ${rowBg} ${rounding} px-2.5 py-2 hover:border-primary transition-colors`}
                    >
                      <div className={`text-xs font-semibold truncate ${textPrimary}`}>{w.name}</div>
                      <div className={`flex items-center gap-1.5 mt-1 flex-wrap text-[10px] ${textBody}`}>
                        <span className={`px-1.5 py-0.5 ${rounding} border ${rowBg} ${textLabel}`}>{w.workflowTypeLabel}</span>
                        {co.length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className={textLabel}>+</span>
                            {co.slice(0, 4).map((t) => <ToolLogo key={t} tool={t} size={12} />)}
                            {co.length > 4 && <span>+{co.length - 4}</span>}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isToolNode && receiptWorkflow && (
          <div className={`mb-4 space-y-1 text-xs ${textBody}`}>
            <p><span className={textLabel}>Output:</span> {receiptWorkflow.workflowTypeLabel}</p>
            <p><span className={textLabel}>Tools:</span> {receiptWorkflow.tools.join(', ')}</p>
          </div>
        )}

        {!isToolNode && receiptId && (
          <Link to="/participant/receipts/$receiptId" params={{ receiptId }} className="flex items-center gap-2 text-xs text-primary hover:underline mt-3">
            <ExternalLink className="h-3.5 w-3.5" /> View Workflow
          </Link>
        )}

        {node.timestamp && (
          <p className={`text-[9px] mt-4 ${textMuted}`}>{new Date(node.timestamp).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}
