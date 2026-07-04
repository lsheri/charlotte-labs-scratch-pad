import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WebData, WebNode, WebEdge, TimePeriod, ColorByMode, Workflow } from './webTypes';
import { getToolColor, getMediaColor, getHashColor } from './webUtils';
import { toolLabel } from '@/lib/toolLogos';
import { getReceiptDisplayName, getWorkflowType, WORKFLOW_TYPE_LABELS, isWorkflow, getWorkflowTags, getWorkflowPurpose } from '@/lib/displayNames';

function getTimeCutoff(period: TimePeriod): string | null {
  const now = new Date();
  switch (period) {
    case 'session': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    case 'month': { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    default: return null;
  }
}

function pickReceiptColor(colorBy: ColorByMode, meta: { mediaType?: string; toolUsed?: string; category?: string; taskPurpose?: string }) {
  switch (colorBy) {
    case 'medium': { const v = meta.mediaType || 'Unknown'; return { color: getMediaColor(meta.mediaType), colorByValue: v }; }
    case 'tool': { const v = meta.toolUsed || 'Unknown'; return { color: getToolColor(v), colorByValue: v }; }
    case 'category': { const v = meta.category || 'Unknown'; return { color: getHashColor(v), colorByValue: v }; }
    case 'purpose': { const v = meta.taskPurpose || 'Unknown'; return { color: getHashColor(v), colorByValue: v }; }
  }
}

export function useWebData(participantId: string | null, sessionId: string | null, period: TimePeriod, colorBy: ColorByMode = 'medium') {
  const cutoff = getTimeCutoff(period);

  const receiptsQuery = useQuery({
    queryKey: ['web-receipts', participantId, sessionId, period],
    enabled: !!participantId,
    queryFn: async () => {
      let q = supabase.from('receipts')
        .select('id, tool_used, created_at, metadata, prompt_preview')
        .eq('participant_id', participantId!)
        .order('created_at', { ascending: false })
        .limit(120);
      if (sessionId) q = q.eq('session_id', sessionId);
      if (cutoff) q = q.gte('created_at', cutoff);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const convsQuery = useQuery({
    queryKey: ['web-convs', participantId, sessionId, period],
    enabled: !!participantId,
    queryFn: async () => {
      let q = supabase.from('ai_conversations')
        .select('tool, captured_at')
        .eq('participant_id', participantId!)
        .limit(500);
      if (sessionId) q = q.eq('session_id', sessionId);
      if (cutoff) q = q.gte('captured_at', cutoff);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const webData: WebData = useMemo(() => {
    const receipts = receiptsQuery.data ?? [];
    const convs = convsQuery.data ?? [];
    const nodes: WebNode[] = [];
    const edges: WebEdge[] = [];

    nodes.push({ id: 'user-center', type: 'user', label: 'You', ring: 0, color: 'hsl(204 100% 77%)' });

    const toolCount = new Map<string, number>();
    convs.forEach((c) => {
      const t = (c.tool ?? 'unknown').toLowerCase();
      toolCount.set(t, (toolCount.get(t) ?? 0) + 1);
    });
    receipts.forEach((r) => {
      const t = (r.tool_used ?? 'unknown').toLowerCase();
      if (!toolCount.has(t)) toolCount.set(t, 0);
      toolCount.set(t, (toolCount.get(t) ?? 0) + 1);
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const extras = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
      extras.forEach((tt) => {
        const k = String(tt).toLowerCase();
        if (k && k !== t) toolCount.set(k, (toolCount.get(k) ?? 0) + 1);
      });
    });

    toolCount.forEach((count, tool) => {
      nodes.push({
        id: `tool-${tool}`, type: 'tool', label: toolLabel(tool),
        ring: 1, color: getToolColor(tool),
        metrics: { interactionCount: count, frequency: count },
      });
      edges.push({
        id: `e-user-${tool}`, source: 'user-center', target: `tool-${tool}`,
        type: 'used_with', weight: Math.min(count / 3, 3),
      });
    });

    const recentReceipts = receipts.slice(0, 80);
    recentReceipts.forEach((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const tool = (r.tool_used ?? 'unknown').toLowerCase();
      const m = {
        mediaType: meta.mediaType as string | undefined,
        toolUsed: r.tool_used ?? undefined,
        category: meta.category as string | undefined,
        taskPurpose: meta.taskPurpose as string | undefined,
      };
      const { color, colorByValue } = pickReceiptColor(colorBy, m);
      const label = (meta.label as string) || (r.prompt_preview ? r.prompt_preview.slice(0, 32) : 'Receipt');
      nodes.push({
        id: `receipt-${r.id}`, type: 'receipt', label,
        ring: 2, timestamp: r.created_at, color,
        metrics: { interactionCount: 1 },
        metadata: { receiptId: r.id, colorByValue, ...m },
      });
      edges.push({
        id: `e-tool-receipt-${r.id}`, source: `tool-${tool}`, target: `receipt-${r.id}`,
        type: 'generated_by', weight: 1, timestamps: [r.created_at],
      });
      const extras = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
      extras.forEach((tt) => {
        const k = String(tt).toLowerCase();
        if (k && k !== tool && toolCount.has(k)) {
          edges.push({
            id: `e-tool-receipt-${r.id}-${k}`, source: `tool-${k}`, target: `receipt-${r.id}`,
            type: 'generated_by', weight: 0.7,
          });
        }
      });
    });

    // Cross-tool workflow links from receipts that list multiple tools
    const pairCounts = new Map<string, number>();
    recentReceipts.forEach((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const tools = new Set<string>();
      tools.add((r.tool_used ?? 'unknown').toLowerCase());
      const extras = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
      extras.forEach((tt) => tools.add(String(tt).toLowerCase()));
      const arr = Array.from(tools).sort();
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const k = `${arr[i]}::${arr[j]}`;
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    });
    pairCounts.forEach((count, key) => {
      const [a, b] = key.split('::');
      if (toolCount.has(a) && toolCount.has(b)) {
        edges.push({
          id: `e-wf-${a}-${b}`, source: `tool-${a}`, target: `tool-${b}`,
          type: 'workflow_link', weight: Math.min(count, 4),
          metadata: { sharedWorkflows: count },
        });
      }
    });

    return { nodes, edges };
  }, [receiptsQuery.data, convsQuery.data, colorBy]);

  const workflows: Workflow[] = useMemo(() => {
    const receipts = receiptsQuery.data ?? [];
    return receipts
      .filter((r) => isWorkflow(r as any))
      .map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const tools = new Set<string>();
        tools.add((r.tool_used ?? 'unknown').toLowerCase());
        const extras = Array.isArray(meta.tools) ? (meta.tools as string[]) : [];
        extras.forEach((t) => tools.add(String(t).toLowerCase()));
        const wfType = getWorkflowType(r as any);
        return {
          receiptId: r.id,
          name: getReceiptDisplayName(r as any),
          workflowType: wfType,
          workflowTypeLabel: WORKFLOW_TYPE_LABELS[wfType],
          tools: Array.from(tools),
          tags: getWorkflowTags(r as any),
          purpose: getWorkflowPurpose(r as any),
          createdAt: r.created_at,
        };
      });
  }, [receiptsQuery.data]);

  const workflowsByTool = useMemo(() => {
    const map = new Map<string, Workflow[]>();
    workflows.forEach((w) => {
      w.tools.forEach((t) => {
        const arr = map.get(t) ?? [];
        arr.push(w);
        map.set(t, arr);
      });
    });
    return map;
  }, [workflows]);

  return {
    webData,
    workflows,
    workflowsByTool,
    isLoading: receiptsQuery.isLoading || convsQuery.isLoading,
    error: receiptsQuery.error || convsQuery.error,
  };
}
