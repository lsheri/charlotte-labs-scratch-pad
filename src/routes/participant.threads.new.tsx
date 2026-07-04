import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { CharlottePromptCTA } from "@/components/manual/CharlottePromptCTA";
import { parseConversation, detectToolFromHeader, type ConversationTurn } from "@/lib/parseConversation";
import { createManualThread } from "@/serverfn/threads";
import { posthog } from "@/lib/posthog";

export const Route = createFileRoute("/participant/threads/new")({ component: NewThreadPage });

const TOOLS = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "copilot", label: "Copilot" },
  { value: "perplexity", label: "Perplexity" },
  { value: "grok", label: "Grok" },
  { value: "deepseek", label: "Deepseek" },
  { value: "lovable", label: "Lovable" },
  { value: "bolt", label: "Bolt" },
  { value: "other", label: "Other" },
];

function NewThreadPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createManualThread);
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [tool, setTool] = useState("other");
  const [filename, setFilename] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_CHARS = 180_000;

  // Full re-parse: only used for file drops or explicit "Re-parse" action.
  // We deliberately do NOT call this on every textarea keystroke so the user's
  // manual role flips and tool selection aren't clobbered as they edit.
  const acceptText = (text: string, name?: string) => {
    setTranscript(text);
    if (name !== undefined) setFilename(name);
    const parsed = parseConversation(text);
    setTurns(parsed);
    const detected = detectToolFromHeader(text);
    if (detected !== "other") setTool(detected);
    if (!title) {
      const fromName = name?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      const firstUser = parsed.find(t => t.role === "user")?.content?.slice(0, 80);
      setTitle(fromName || firstUser || "Manual upload");
    }
  };

  const handleFile = async (file: File) => {
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      toast.error("Please upload a .txt or .md file. (For .docx, copy the text and paste it below.)");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("File too large (2 MB max).");
      return;
    }
    const text = await file.text();
    if (text.length > MAX_CHARS) {
      toast.error(`Transcript is too long (${text.length.toLocaleString()} chars, max ${MAX_CHARS.toLocaleString()}). Trim it and try again.`);
      return;
    }
    acceptText(text, file.name);
    toast.success(`Loaded ${file.name}`);
  };

  const reparseFromTextarea = () => {
    if (!transcript.trim()) { toast.error("Paste a transcript first."); return; }
    if (transcript.length > MAX_CHARS) { toast.error(`Too long (max ${MAX_CHARS.toLocaleString()} chars).`); return; }
    acceptText(transcript, filename);
    toast.success("Re-parsed");
  };

  const flipRole = (idx: number) => {
    setTurns(t => t.map((x, i) => i === idx ? { ...x, role: x.role === "user" ? "assistant" : "user", confidence: "high" } : x));
  };

  // Safety net: server caps each turn at 200k chars. If a single turn (usually
  // one huge AI response) exceeds that, split it on paragraph boundaries into
  // consecutive same-role turns. Scales for very long transcripts without
  // losing content or surfacing scary Zod errors to the user.
  const MAX_TURN_CHARS = 190_000;
  const splitOversizedTurns = (input: ConversationTurn[]): ConversationTurn[] => {
    const out: ConversationTurn[] = [];
    for (const t of input) {
      if (t.content.length <= MAX_TURN_CHARS) { out.push(t); continue; }
      const paras = t.content.split(/\n{2,}/);
      let buf = "";
      const flush = () => { if (buf.trim()) out.push({ ...t, content: buf.trim() }); buf = ""; };
      for (const p of paras) {
        if ((buf + "\n\n" + p).length > MAX_TURN_CHARS) {
          flush();
          if (p.length > MAX_TURN_CHARS) {
            // Hard chunk if a single paragraph is still too big.
            for (let i = 0; i < p.length; i += MAX_TURN_CHARS) {
              out.push({ ...t, content: p.slice(i, i + MAX_TURN_CHARS) });
            }
          } else { buf = p; }
        } else { buf = buf ? buf + "\n\n" + p : p; }
      }
      flush();
    }
    return out;
  };

  const submit = async () => {
    if (!turns.length || !title.trim()) {
      toast.error("Add a title and a transcript first.");
      return;
    }
    setBusy(true);
    posthog.capture("manual_thread_submit_started", {
      tool, turn_count: turns.length, has_filename: Boolean(filename),
    });
    try {
      const safeTurns = splitOversizedTurns(turns);
      if (safeTurns.length !== turns.length) {
        toast.info(`Split ${turns.length - 1} long turn(s) into smaller chunks so the upload fits.`);
      }
      const r: any = await createFn({ data: {
        title: title.trim(),
        tool,
        transcript,
        turns: safeTurns.map(t => ({ role: t.role, content: t.content })),
        sourceFilename: filename,
      } });
      posthog.capture("manual_thread_submit_completed", {
        tool, turn_count: safeTurns.length, deduped: Boolean(r?.deduped),
      });
      if (r.deduped) toast.info("This transcript was already uploaded.");
      else toast.success("Thread created");
      navigate({ to: "/participant/threads" });
    } catch (e: any) {
      // Zod errors come back as JSON strings — translate to plain English.
      const raw = e?.message ?? "";
      let friendly = raw || "Failed to create thread";
      if (raw.includes("too_big") || raw.includes("String must contain at most")) {
        friendly = "One section of your transcript is unusually long. We tried to split it, but it's still too big — please trim it or split the conversation into two uploads.";
      } else if (raw.includes("too_small") || raw.includes("must contain at least")) {
        friendly = "The transcript looks empty. Paste the conversation text and try again.";
      }
      posthog.capture("manual_thread_submit_failed", { tool, error: raw.slice(0, 200) });
      toast.error(friendly);
    } finally {
      setBusy(false);
    }
  };

  const turnStats = useMemo(() => {
    const u = turns.filter(t => t.role === "user").length;
    const a = turns.filter(t => t.role === "assistant").length;
    return { u, a };
  }, [turns]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/participant/threads"><ArrowLeft className="h-4 w-4 mr-1" /> Back to threads</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Upload className="h-6 w-6" /> Add thread manually
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Working from your phone or somewhere the extension can't capture? Use the prompt below to export your conversation, then upload it here. The thread behaves like any other — you can combine it into receipts and it appears on your fingerprint.
        </p>
      </div>

      <CharlottePromptCTA />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload or paste the transcript</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          >
            <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium mt-2">Drop a .txt or .md file here, or click to browse</p>
            <p className="text-xs text-muted-foreground">Max 2 MB. For .docx, copy the text and paste it below.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcript</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={reparseFromTextarea} disabled={!transcript.trim()}>
                Re-parse
              </Button>
            </div>
            <Textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the AI Collaboration Log file contents here, then click Re-parse…"
              className="min-h-[160px] font-mono text-xs"
              maxLength={MAX_CHARS}
            />
            <p className="text-[11px] text-muted-foreground">
              {transcript.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="title">Thread title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this conversation a name" />
            </div>
            <div className="space-y-1">
              <Label>AI tool</Label>
              <Select value={tool} onValueChange={setTool}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TOOLS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {turns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Parsed conversation</span>
              <span className="text-xs font-normal text-muted-foreground">
                {turns.length} turns · {turnStats.u} user · {turnStats.a} assistant
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Click a turn to flip its role if Charlotte got it wrong.
            </p>
            <div className="space-y-2 max-h-[480px] overflow-auto">
              {turns.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => flipRole(i)}
                  className={`w-full text-left rounded-lg border p-3 hover:border-primary transition ${t.role === "user" ? "bg-muted/40" : "bg-card"}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant={t.role === "user" ? "secondary" : "default"} className="capitalize">{t.role}</Badge>
                    {t.confidence && t.confidence !== "high" && (
                      <Badge variant="outline" className="text-[10px] capitalize">{t.confidence} confidence</Badge>
                    )}
                  </div>
                  <p className="text-xs whitespace-pre-wrap line-clamp-6 text-foreground/90">{t.content}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild><Link to="/participant/threads">Cancel</Link></Button>
        <Button onClick={submit} disabled={busy || !turns.length || !title.trim()}>
          {busy ? "Creating…" : "Create thread"}
        </Button>
      </div>
    </div>
  );
}
