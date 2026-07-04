import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Download, Users, MessageSquare, Activity, FileCheck, Wrench, Gauge, ArrowUpDown, Check, Lightbulb, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { FluencyRadar } from "@/components/FluencyRadar";
import { getSessionConstructSummary, getSessionChainSummary } from "@/serverfn/admin-data";

export const Route = createFileRoute("/researcher/sessions/$sessionId")({ component: SessionDetail });

interface SessionInfo { id: string; name: string; description: string | null; status: string; join_code: string; created_at: string }
interface Participant { participant_id: string; joined_at: string; display_name: string | null }
interface ConvRow { id: string; tool: string; title: string | null; ai_summary: string | null; participant_id: string; captured_at: string; prompt_text: string }
interface RunRow { run_id: string; participant_id: string; analysis_output_json: any; created_at: string; receipt_id?: string | null }
interface ReceiptRow { id: string; participant_id: string; tool_used: string; created_at: string; metadata?: any }

const LEVELS = ["Emerging", "Developing", "Proficient", "Advanced"] as const;
type Level = typeof LEVELS[number];

const LEVEL_COLORS: Record<Level, { bar: string; badge: string }> = {
  Emerging:   { bar: "bg-rose-500",  badge: "bg-rose-100 text-rose-800 border-rose-200" },
  Developing: { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  Proficient: { bar: "bg-blue-500",  badge: "bg-blue-100 text-blue-800 border-blue-200" },
  Advanced:   { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const TOOL_PALETTE = ["bg-indigo-500", "bg-fuchsia-500", "bg-cyan-500", "bg-orange-500", "bg-lime-500", "bg-pink-500", "bg-teal-500", "bg-yellow-500"];

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(rows: (string | number | null)[][], filename: string) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function SessionDetail() {
  const { sessionId } = Route.useParams();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchConstructSummary = useServerFn(getSessionConstructSummary);
  const fetchChainSummary = useServerFn(getSessionChainSummary);
  const { data: constructSummary } = useQuery({
    queryKey: ["session-construct-summary", sessionId],
    queryFn: () => fetchConstructSummary({ data: { sessionId } }),
    staleTime: 5 * 60 * 1000,
    enabled: !!sessionId,
  });
  const { data: chainSummary } = useQuery({
    queryKey: ["session-chain-summary", sessionId],
    queryFn: () => fetchChainSummary({ data: { sessionId } }),
    staleTime: 5 * 60 * 1000,
    enabled: !!sessionId,
  });
  const [constructOpen, setConstructOpen] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);
  const [perReceiptSignals, setPerReceiptSignals] = useState<Array<{ participant_id: string; receipt_id: string; c5_challenge_rate: number | null }>>([]);
  const [sessionChains, setSessionChains] = useState<Array<{ participant_id: string; chain_type: string | null }>>([]);

  // Filters
  const [fParticipant, setFParticipant] = useState<string>("all");
  const [fTool, setFTool] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");

  // Participant table sorting
  const [sortKey, setSortKey] = useState<"receiptCount" | "latestConfidence" | "lastSubmitted">("lastSubmitted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }, { data: c }, { data: r }, { data: rec }, { data: sigs }, { data: chs }] = await Promise.all([
        supabase.from("research_sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase.from("session_participants").select("participant_id, joined_at").eq("session_id", sessionId),
        supabase.from("ai_conversations").select("id, tool, title, ai_summary, participant_id, captured_at, prompt_text")
          .eq("session_id", sessionId).order("captured_at", { ascending: false }).limit(500),
        supabase.from("fluency_analysis_runs").select("run_id, participant_id, analysis_output_json, created_at, receipt_id")
          .eq("session_id", sessionId).order("created_at", { ascending: false }).limit(500),
        supabase.from("receipts").select("id, participant_id, tool_used, created_at")
          .eq("session_id", sessionId).order("created_at", { ascending: false }).limit(500),
        supabase.from("receipt_construct_signals")
          .select("participant_id, receipt_id, c5_challenge_rate")
          .eq("session_id", sessionId),
        supabase.from("prompt_chains")
          .select("participant_id, chain_type")
          .eq("session_id", sessionId),
      ]);
      setSession(s as any);
      const pIds = (p ?? []).map(x => x.participant_id);
      let names: Record<string, string | null> = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", pIds);
        names = Object.fromEntries((profs ?? []).map(pr => [pr.id, pr.display_name]));
      }
      setParticipants((p ?? []).map(x => ({ ...x, display_name: names[x.participant_id] ?? null })) as Participant[]);
      setConvs((c ?? []) as ConvRow[]);
      setRuns((r ?? []) as RunRow[]);
      setReceipts((rec ?? []) as ReceiptRow[]);
      setPerReceiptSignals((sigs ?? []) as any);
      setSessionChains((chs ?? []) as any);
      setLoading(false);
    })();
  }, [sessionId]);

  const participantName = (id: string) =>
    participants.find(p => p.participant_id === id)?.display_name ?? id.slice(0, 8);

  const tools = useMemo(() => Array.from(new Set(convs.map(c => c.tool))).sort(), [convs]);

  const filteredConvs = useMemo(() => {
    return convs.filter(c => {
      if (fParticipant !== "all" && c.participant_id !== fParticipant) return false;
      if (fTool !== "all" && c.tool !== fTool) return false;
      if (fFrom && new Date(c.captured_at) < new Date(fFrom)) return false;
      if (fTo) {
        const end = new Date(fTo); end.setDate(end.getDate() + 1);
        if (new Date(c.captured_at) >= end) return false;
      }
      return true;
    });
  }, [convs, fParticipant, fTool, fFrom, fTo]);

  const aggregateDims = useMemo(() => {
    const agg = new Map<string, { display: string; sum: number; n: number }>();
    for (const run of runs) {
      const a = run.analysis_output_json;
      for (const d of (a?.dimensions ?? [])) {
        if (d.canonical_name === "capital_stewardship") continue;
        if (typeof d.score !== "number") continue;
        const cur = agg.get(d.canonical_name) ?? { display: d.display_name ?? d.canonical_name, sum: 0, n: 0 };
        cur.sum += d.score; cur.n += 1;
        agg.set(d.canonical_name, cur);
      }
    }
    return Array.from(agg.entries()).map(([k, v]) => ({
      canonical_name: k, display_name: v.display, score: v.n ? v.sum / v.n : null,
    }));
  }, [runs]);

  // 2a-helper: latest run per participant (runs are sorted desc by created_at already).
  const latestRunByParticipant = useMemo(() => {
    const m = new Map<string, RunRow>();
    for (const r of runs) {
      const cur = m.get(r.participant_id);
      if (!cur || new Date(r.created_at) > new Date(cur.created_at)) m.set(r.participant_id, r);
    }
    return m;
  }, [runs]);

  // 2a: level distribution from latest run per participant
  const levelDistribution = useMemo(() => {
    const out: Record<Level, number> = { Emerging: 0, Developing: 0, Proficient: 0, Advanced: 0 };
    for (const run of latestRunByParticipant.values()) {
      const lvl = run.analysis_output_json?.overall_level as string | undefined;
      if (lvl && (LEVELS as readonly string[]).includes(lvl)) out[lvl as Level] += 1;
    }
    return out;
  }, [latestRunByParticipant]);

  // 2b: tool distribution — unique participants per tool
  const toolDistribution = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of convs) {
      if (!m.has(c.tool)) m.set(c.tool, new Set());
      m.get(c.tool)!.add(c.participant_id);
    }
    return Array.from(m.entries())
      .map(([tool, set]) => ({ tool, participantCount: set.size }))
      .sort((a, b) => b.participantCount - a.participantCount);
  }, [convs]);

  // 2c: dimension grid w/ scoredCount + color
  const dimensionGrid = useMemo(() => {
    const scoredCounts = new Map<string, number>();
    for (const run of runs) {
      for (const d of (run.analysis_output_json?.dimensions ?? [])) {
        if (typeof d.score === "number") scoredCounts.set(d.canonical_name, (scoredCounts.get(d.canonical_name) ?? 0) + 1);
      }
    }
    const colorOf = (s: number | null, n: number): "green" | "yellow" | "red" | "gray" => {
      if (s === null || n === 0) return "gray";
      if (s >= 4) return "green";
      if (s >= 2.5) return "yellow";
      return "red";
    };
    const enriched = aggregateDims.map(d => {
      const n = scoredCounts.get(d.canonical_name) ?? 0;
      return { ...d, scoredCount: n, color: colorOf(d.score, n) };
    });
    enriched.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });
    return enriched;
  }, [aggregateDims, runs]);

  // 2d: per-tool fluency — join run -> receipt by receipt_id
  const perToolFluency = useMemo(() => {
    const receiptById = new Map(receipts.map(r => [r.id, r]));
    const m = new Map<string, { sum: number; n: number }>();
    for (const run of runs) {
      const conf = run.analysis_output_json?.overall_confidence;
      if (typeof conf !== "number") continue;
      const rec = run.receipt_id ? receiptById.get(run.receipt_id) : undefined;
      const tool = rec?.tool_used;
      if (!tool) continue;
      const cur = m.get(tool) ?? { sum: 0, n: 0 };
      cur.sum += conf; cur.n += 1;
      m.set(tool, cur);
    }
    return Array.from(m.entries())
      .filter(([, v]) => v.n >= 3)
      .map(([tool, v]) => ({ tool, meanConfidence: v.sum / v.n, runCount: v.n }))
      .sort((a, b) => b.meanConfidence - a.meanConfidence)
      .slice(0, 4);
  }, [runs, receipts]);

  // 2e: participant progress
  const participantProgress = useMemo(() => {
    const convsByP = new Map<string, ConvRow[]>();
    for (const c of convs) {
      if (!convsByP.has(c.participant_id)) convsByP.set(c.participant_id, []);
      convsByP.get(c.participant_id)!.push(c);
    }
    const receiptsByP = new Map<string, ReceiptRow[]>();
    for (const r of receipts) {
      if (!receiptsByP.has(r.participant_id)) receiptsByP.set(r.participant_id, []);
      receiptsByP.get(r.participant_id)!.push(r);
    }
    return participants.map(p => {
      const pid = p.participant_id;
      const pConvs = convsByP.get(pid) ?? [];
      const pReceipts = receiptsByP.get(pid) ?? [];
      const latest = latestRunByParticipant.get(pid);
      const latestRec = pReceipts.length ? pReceipts.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b) : null;
      const tools = Array.from(new Set(pConvs.map(c => c.tool)));
      const pSigs = perReceiptSignals.filter(s => s.participant_id === pid);
      const validRates = pSigs.map(s => s.c5_challenge_rate).filter((v): v is number => v !== null && v !== undefined);
      const avgChallengeRate = validRates.length ? validRates.reduce((a, b) => a + b, 0) / validRates.length : null;
      const loopChainCount = sessionChains.filter(c => c.participant_id === pid && c.chain_type === "loop").length;
      return {
        participantId: pid,
        shortId: pid.slice(0, 8),
        hasConversations: pConvs.length > 0,
        receiptCount: pReceipts.length,
        latestLevel: (latest?.analysis_output_json?.overall_level ?? null) as string | null,
        latestConfidence: typeof latest?.analysis_output_json?.overall_confidence === "number"
          ? latest!.analysis_output_json.overall_confidence as number : null,
        toolsUsed: tools,
        lastSubmitted: latestRec?.created_at ?? null,
        avgChallengeRate,
        loopChainCount,
      };
    });
  }, [participants, convs, receipts, latestRunByParticipant, perReceiptSignals, sessionChains]);

  const sortedProgress = useMemo(() => {
    const copy = [...participantProgress];
    copy.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      // null last regardless of dir
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      let cmp = 0;
      if (sortKey === "lastSubmitted") cmp = new Date(av as string).getTime() - new Date(bv as string).getTime();
      else cmp = (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [participantProgress, sortKey, sortDir]);

  // Avg confidence across all runs
  const avgConfidence = useMemo(() => {
    const vals = runs.map(r => r.analysis_output_json?.overall_confidence).filter((v: any) => typeof v === "number") as number[];
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [runs]);

  // 2f: observations
  const observations = useMemo(() => {
    const out: string[] = [];
    const totalP = participants.length;
    if (totalP > 0) {
      const noConvs = participantProgress.filter(p => !p.hasConversations).length;
      if (noConvs > 0) out.push(`${noConvs} of ${totalP} participants have not captured any AI conversations yet.`);
      const convsNoReceipt = participantProgress.filter(p => p.hasConversations && p.receiptCount === 0).length;
      if (convsNoReceipt > 0) out.push(`${convsNoReceipt} participants have conversations captured but have not submitted a receipt.`);
    }
    if (receipts.length > 0 && runs.length < receipts.length * 0.8) {
      out.push(`Analysis is incomplete — only ${runs.length} of ${receipts.length} receipts have been scored. Aggregate data may shift as remaining receipts are processed.`);
    }
    const scored = dimensionGrid.filter(d => d.score !== null && d.scoredCount >= 3);
    if (scored.length > 0) {
      const weakest = scored[0];
      const strongest = scored[scored.length - 1];
      out.push(`${weakest.display_name} is the weakest area across this session — mean score ${(weakest.score as number).toFixed(1)} across ${weakest.scoredCount} participants.`);
      if (strongest.canonical_name !== weakest.canonical_name) {
        out.push(`${strongest.display_name} is the strongest area — mean score ${(strongest.score as number).toFixed(1)}.`);
      }
    }
    const analyzedCount = Array.from(latestRunByParticipant.keys()).length;
    if (analyzedCount > 0) {
      const top = (Object.entries(levelDistribution) as [Level, number][])
        .sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) {
        out.push(`Most participants are at the ${top[0]} level (${top[1]} of ${analyzedCount} analyzed).`);
      }
    }
    if (perToolFluency.length >= 2) {
      const [a, b] = perToolFluency;
      out.push(`Participants using ${a.tool} show higher overall confidence (${a.meanConfidence.toFixed(2)}) than those using ${b.tool} (${b.meanConfidence.toFixed(2)}).`);
    }
    return out;
  }, [participants, participantProgress, receipts.length, runs.length, dimensionGrid, latestRunByParticipant, levelDistribution, perToolFluency]);

  const exportFluencyCsv = async () => {
    const progressById = new Map(participantProgress.map(p => [p.participantId, p]));
    const receiptById = new Map(receipts.map(r => [r.id, r]));
    const receiptIds = runs.map(r => r.receipt_id).filter(Boolean) as string[];
    const signalsMap = new Map<string, any>();
    const chainCountMap = new Map<string, { total: number; loops: number }>();
    if (receiptIds.length) {
      const [{ data: sigs }, { data: chs }] = await Promise.all([
        supabase.from("receipt_construct_signals")
          .select("receipt_id, c5_challenge_rate, c11_mean_structure_score, c3_iteration_rate, c4_role_directive_rate, c10_clarification_rate, c16_meta_rate")
          .in("receipt_id", receiptIds),
        supabase.from("prompt_chains")
          .select("receipt_id, chain_type")
          .in("receipt_id", receiptIds),
      ]);
      for (const s of (sigs ?? []) as any[]) signalsMap.set(s.receipt_id, s);
      for (const c of (chs ?? []) as any[]) {
        if (!c.receipt_id) continue;
        const cur = chainCountMap.get(c.receipt_id) ?? { total: 0, loops: 0 };
        cur.total += 1;
        if (c.chain_type === "loop") cur.loops += 1;
        chainCountMap.set(c.receipt_id, cur);
      }
    }
    const header = [
      "short_participant_id", "receipt_count", "tools_used",
      "run_id", "participant_id", "created_at", "overall_level", "overall_confidence", "goal",
      ...dimensionGrid.filter(d => d.canonical_name !== "capital_stewardship").map(d => `score_${d.canonical_name}`),
      "c5_challenge_rate", "c11_mean_structure_score", "c3_iteration_rate",
      "c4_role_directive_rate", "c10_clarification_rate", "c16_meta_rate",
      "loop_chain_count", "total_chains",
    ];
    const rows = runs.map(r => {
      const a = r.analysis_output_json ?? {};
      const dimMap: Record<string, number | null> = {};
      for (const d of (a.dimensions ?? [])) dimMap[d.canonical_name] = d.score ?? null;
      const prog = progressById.get(r.participant_id);
      const rec = r.receipt_id ? receiptById.get(r.receipt_id) : undefined;
      const goal = (rec?.metadata as any)?.goal ?? "";
      const sigs = r.receipt_id ? signalsMap.get(r.receipt_id) : undefined;
      const chainData = r.receipt_id ? chainCountMap.get(r.receipt_id) : undefined;
      return [
        prog?.shortId ?? r.participant_id.slice(0, 8),
        prog?.receiptCount ?? 0,
        (prog?.toolsUsed ?? []).join(", "),
        r.run_id, r.participant_id, r.created_at, a.overall_level ?? "", a.overall_confidence ?? "", goal,
        ...dimensionGrid.filter(d => d.canonical_name !== "capital_stewardship").map(d => dimMap[d.canonical_name] ?? ""),
        sigs?.c5_challenge_rate ?? "",
        sigs?.c11_mean_structure_score ?? "",
        sigs?.c3_iteration_rate ?? "",
        sigs?.c4_role_directive_rate ?? "",
        sigs?.c10_clarification_rate ?? "",
        sigs?.c16_meta_rate ?? "",
        chainData?.loops ?? "",
        chainData?.total ?? "",
      ];
    });
    const completeness = receipts.length > 0 ? `${runs.length}/${receipts.length} receipts analyzed` : "unknown";
    const meta = [["# Charlotte Research Hub — Fluency Export", `session: ${session?.join_code}`, `analysis coverage: ${completeness}`, `exported: ${new Date().toISOString()}`]];
    const dateStr = format(new Date(), "yyyy-MM-dd");
    downloadCsv([...meta, header, ...rows], `charlotte-session-${session?.join_code ?? sessionId}-fluency-${dateStr}.csv`);
    toast.success("Fluency CSV exported");
  };

  const exportConversationsCsv = () => {
    const header = ["captured_at", "participant", "participant_id", "tool", "title", "ai_summary", "prompt_text", "conversation_id"];
    const rows = filteredConvs.map(c => [
      c.captured_at, participantName(c.participant_id), c.participant_id, c.tool,
      c.title ?? "", c.ai_summary ?? "", c.prompt_text ?? "", c.id,
    ]);
    downloadCsv([header, ...rows], `session-${session?.join_code ?? sessionId}-conversations.csv`);
    toast.success(`Conversations CSV exported (${filteredConvs.length} rows)`);
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!session) return <p className="text-sm text-muted-foreground">Session not found.</p>;

  const analyzedTotal = Object.values(levelDistribution).reduce((a, b) => a + b, 0);
  const maxToolCount = toolDistribution[0]?.participantCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/researcher" className="text-xs text-muted-foreground hover:underline">← All sessions</Link>
          <h1 className="mt-1 text-2xl font-semibold">{session.name}</h1>
          <p className="text-sm text-muted-foreground">{session.description || "No description"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={session.status === "active" ? "default" : "secondary"}>{session.status}</Badge>
          <Badge variant="outline">Code: {session.join_code}</Badge>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Users className="h-4 w-4" />} label="Participants" value={participants.length} />
        <StatCard icon={<FileCheck className="h-4 w-4" />} label="Receipts submitted" value={receipts.length} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Analysis coverage"
          value={receipts.length > 0 ? `${Math.round(runs.length / receipts.length * 100)}%` : "—"} />
        <StatCard icon={<Gauge className="h-4 w-4" />} label="Avg confidence"
          value={avgConfidence !== null ? avgConfidence.toFixed(2) : "—"} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Conversations" value={convs.length} />
        <StatCard icon={<Wrench className="h-4 w-4" />} label="Tools in use" value={toolDistribution.length} />
      </div>

      {/* Bento middle grid */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-12">
        {/* Session insights */}
        {observations.length > 0 && (
          <Card className="min-w-0 xl:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />Session insights</CardTitle>
              <CardDescription>Computed observations from current data.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {observations.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Aggregate fluency radar — tall right tile */}
        <Card className="min-w-0 lg:col-span-2 xl:col-span-8 xl:row-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Aggregate fluency profile</CardTitle>
                <CardDescription>Average across {runs.length} runs.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportFluencyCsv} disabled={runs.length === 0}>
                <Download className="mr-1 h-4 w-4" />Fluency CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length < receipts.length && receipts.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ Fluency data is incomplete — {runs.length} of {receipts.length} receipts have been analyzed.
                Averages shown reflect only analyzed receipts. Missing analyses may affect results.
              </div>
            )}
            {aggregateDims.length === 0 ? <p className="text-sm text-muted-foreground">No fluency data yet.</p>
              : <FluencyRadar dimensions={aggregateDims} />}
          </CardContent>
        </Card>

        {/* Fluency level distribution */}
        <Card className="min-w-0 xl:col-span-4">
          <CardHeader>
            <CardTitle>Fluency level distribution</CardTitle>
            <CardDescription>Latest analyzed level per participant.</CardDescription>
          </CardHeader>
          <CardContent>
            {analyzedTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No analyzed receipts yet.</p>
            ) : (
              <div className="space-y-3">
                {LEVELS.map(lvl => {
                  const n = levelDistribution[lvl];
                  const pct = analyzedTotal > 0 ? (n / analyzedTotal) * 100 : 0;
                  return (
                    <div key={lvl}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{lvl}</span>
                        <span className="text-muted-foreground">{n} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${LEVEL_COLORS[lvl].bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tools in use */}
        <Card className="min-w-0 xl:col-span-4">
          <CardHeader>
            <CardTitle>Tools in use</CardTitle>
            <CardDescription>Unique participants per tool.</CardDescription>
          </CardHeader>
          <CardContent>
            {toolDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversations captured yet.</p>
            ) : (
              <div className="space-y-3">
                {toolDistribution.map((t, i) => {
                  const pct = maxToolCount > 0 ? (t.participantCount / maxToolCount) * 100 : 0;
                  return (
                    <div key={t.tool}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{t.tool}</span>
                        <span className="text-muted-foreground">{t.participantCount}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${TOOL_PALETTE[i % TOOL_PALETTE.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dimension performance grid — sits under radar in xl, full width on lg */}
        <Card className="min-w-0 lg:col-span-2 xl:col-span-12">
          <CardHeader>
            <CardTitle>Dimension performance — weakest to strongest</CardTitle>
            <CardDescription>Mean score across analyzed receipts (0–5 scale).</CardDescription>
          </CardHeader>
          <CardContent>
            {dimensionGrid.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fluency data yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
                {dimensionGrid.map(d => {
                  const colorBar = d.color === "green" ? "bg-emerald-500"
                    : d.color === "yellow" ? "bg-amber-500"
                    : d.color === "red" ? "bg-rose-500" : "bg-muted-foreground/40";
                  const pct = d.score !== null ? (d.score / 5) * 100 : 0;
                  return (
                    <div key={d.canonical_name} className="rounded-md border p-3">
                      <div className="text-xs font-medium leading-tight">{d.display_name}</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {d.score !== null ? d.score.toFixed(1) : "—"}
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${colorBar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{d.scoredCount} scored</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Participant progress — full width */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Participant progress</CardTitle>
          <CardDescription>Per-participant capture and analysis status.</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants have joined yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Conversations</TableHead>
                  <TableHead>
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("receiptCount")}>
                      Receipts <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Analysis level</TableHead>
                  <TableHead>
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("latestConfidence")}>
                      Confidence <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Avg challenge</TableHead>
                  <TableHead>Loop chains</TableHead>
                  <TableHead>
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("lastSubmitted")}>
                      Last submitted <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProgress.map(p => {
                  const lvlValid = p.latestLevel && (LEVELS as readonly string[]).includes(p.latestLevel);
                  const lvlBadge = lvlValid
                    ? <Badge variant="outline" className={LEVEL_COLORS[p.latestLevel as Level].badge}>{p.latestLevel}</Badge>
                    : p.receiptCount > 0 ? <Badge variant="outline">Pending</Badge>
                    : <span className="text-muted-foreground">—</span>;
                  const toolsLabel = p.toolsUsed.length === 0 ? "—"
                    : p.toolsUsed.length <= 3 ? p.toolsUsed.join(", ")
                    : `${p.toolsUsed.slice(0, 3).join(", ")} +${p.toolsUsed.length - 3} more`;
                  return (
                    <TableRow key={p.participantId}>
                      <TableCell className="font-mono text-xs">{p.shortId}</TableCell>
                      <TableCell>{p.hasConversations ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{p.receiptCount}</TableCell>
                      <TableCell>{lvlBadge}</TableCell>
                      <TableCell>{p.latestConfidence !== null ? p.latestConfidence.toFixed(2) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs">{toolsLabel}</TableCell>
                      <TableCell className="tabular-nums text-xs">{p.avgChallengeRate !== null ? p.avgChallengeRate.toFixed(2) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-xs">{p.loopChainCount > 0 ? <span className="text-amber-700 font-medium">{p.loopChainCount}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell className="text-xs">{p.lastSubmitted ? format(new Date(p.lastSubmitted), "MMM d, h:mm a") : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Conversations — full width */}
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>{filteredConvs.length} of {convs.length} shown</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportConversationsCsv} disabled={filteredConvs.length === 0}>
              <Download className="mr-1 h-4 w-4" />Conversations CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Select value={fParticipant} onValueChange={setFParticipant}>
              <SelectTrigger><SelectValue placeholder="Participant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All participants</SelectItem>
                {participants.map(p => (
                  <SelectItem key={p.participant_id} value={p.participant_id}>
                    {p.display_name ?? p.participant_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fTool} onValueChange={setFTool}>
              <SelectTrigger><SelectValue placeholder="Tool" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tools</SelectItem>
                {tools.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} aria-label="To date" />
          </div>

          {filteredConvs.length === 0 ? <p className="text-sm text-muted-foreground">No conversations match these filters.</p> : (
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {filteredConvs.map(c => (
                <Link key={c.id} to="/researcher/conversations/$convId" params={{ convId: c.id }}
                  className="block rounded-md border p-3 hover:bg-accent/40">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.tool}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(c.captured_at), "MMM d, h:mm a")}</span>
                    <span className="text-xs text-muted-foreground">· {participantName(c.participant_id)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{c.title || c.prompt_text.slice(0, 100)}</p>
                  {c.ai_summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.ai_summary}</p>}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <Collapsible open={constructOpen} onOpenChange={setConstructOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between space-y-0 hover:bg-accent/30 transition-colors">
              <div>
                <CardTitle className="text-base">Construct Signal Summary</CardTitle>
                <CardDescription>Aggregated per-construct signals across all receipts in this session.</CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${constructOpen ? "rotate-180" : ""}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {!constructSummary?.constructs?.length ? (
                <p className="text-sm text-muted-foreground py-4">
                  No construct signal data yet. Data appears after receipts are analyzed.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Construct</TableHead>
                      <TableHead>Signal</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                      <TableHead className="text-right">Participants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {constructSummary.constructs.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.signal}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.avg !== null ? c.avg.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.participantCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <Collapsible open={chainOpen} onOpenChange={setChainOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between space-y-0 hover:bg-accent/30 transition-colors">
              <div>
                <CardTitle className="text-base">Prompt Chain Patterns</CardTitle>
                <CardDescription>
                  Loop rates and chain type distribution across session receipts.
                  {chainSummary?.loopRate != null && (
                    <span className={chainSummary.loopRate > 0.3 ? " text-amber-600 font-medium" : ""}>
                      {" "}Loop rate: {(chainSummary.loopRate * 100).toFixed(0)}% of receipts.
                    </span>
                  )}
                </CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${chainOpen ? "rotate-180" : ""}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {!chainSummary?.summary?.length ? (
                <p className="text-sm text-muted-foreground py-4">
                  No chain data yet. Chains appear after Engine V1 processes receipts.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chain type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Avg prompts</TableHead>
                      <TableHead className="text-right">Loop chains</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chainSummary.summary.map((c) => (
                      <TableRow key={c.chainType} className={c.loopCount > 0 ? "bg-amber-50" : ""}>
                        <TableCell className="font-mono text-xs">{c.chainType}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.avgPromptCount.toFixed(1)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.loopCount > 0 ? <span className="text-amber-700 font-medium">{c.loopCount}</span> : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
      <div><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
    </CardContent></Card>
  );
}
