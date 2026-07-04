import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Sparkles, Copy, Check, ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";

const CHARLOTTE_EXPORT_PROMPT = `You are creating a downloadable structured conversation export file for a research tool called Charlotte.

Charlotte helps people show how they collaborated with AI. It analyzes the process of AI use, including the user's questions, prompts, revisions, reasoning, and how the AI responded.

This export is not a normal summary. It is a structured AI Collaboration Log.

The user will download this file and upload it into Charlotte.

IMPORTANT:
Do NOT respond with a normal chat summary.
Create a downloadable file that contains the structured collaboration log.

Preferred file format:
.txt

File name:
charlotte_ai_collaboration_log_[todays date]_[AI tool used].txt

If downloadable file creation is not available, return the full file contents inside one markdown code block so the user can copy and save it as a .txt file.

---

RULES

1. USER MESSAGES
Preserve every user message VERBATIM. Do not summarize, shorten, clean up, rewrite, or correct spelling.

2. AI RESPONSES
If an AI response is short (under ~150 words), keep it verbatim.
If an AI response is long, summarize it using:
* Core answer: 1–2 sentences preserving the main answer.
* Key points: 3–5 bullets capturing the important substance.
* Actions or recommendations: only if the AI gave concrete next steps.

3. TURN STRUCTURE
Use this exact format:

Turn X
User:
[verbatim user message]

AI:
[verbatim AI response OR structured summary]

4. FILE HEADER
At the very top of the file, include:

AI Collaboration Log
Exact company and model used in the conversation if available (e.g. Sonnet 4.6, GPT-5 mini, Gemini 2.5 Pro)
Generated for Charlotte Analysis

User Consent: This file is intentionally generated and shared for analysis.

5. FINAL RESPONSE
After creating the file, respond only with:
Done. Download the Charlotte AI Collaboration Log file and import it into Charlotte.

If you cannot create a downloadable file, return only the full file contents inside a single markdown code block.`;

const TOOLS = ["ChatGPT", "Claude", "Gemini", "Copilot", "Perplexity", "Grok", "Deepseek", "any AI tool"];

export function CharlottePromptCTA() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CHARLOTTE_EXPORT_PROMPT);
      setCopied(true);
      toast.success("Prompt copied — paste it into your AI conversation.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy manually.");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="group relative w-full overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-accent/5 p-5 text-left transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Recommended</div>
            <div className="text-base font-semibold text-foreground">Use this prompt to generate your AI Collaboration Log</div>
            <div className="text-xs text-muted-foreground">Works with any AI tool — even tools without file download.</div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TOOLS.map(t => (
                <span key={t} className="inline-flex items-center rounded-full border border-border bg-card/80 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  {t}
                </span>
              ))}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary pt-1">
              {open ? "Hide prompt" : "Show prompt"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </div>
        </div>
      </button>

      <CollapsibleContent className="mt-3">
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">How to use this</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4 mt-1">
              <li>Copy the prompt below.</li>
              <li>Paste it as your <span className="font-medium text-foreground">last message</span> in the AI conversation you want to log.</li>
              <li>Download (or copy) the file the AI gives you.</li>
              <li>Drop it into the upload area below — or paste the contents.</li>
            </ol>
          </div>

          <div className="relative">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 pr-12 text-[11px] leading-relaxed font-mono text-foreground/90">
              {CHARLOTTE_EXPORT_PROMPT}
            </pre>
            <Button type="button" size="sm" onClick={handleCopy} className="absolute right-2 top-2 h-8 gap-1.5 shadow-sm">
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-2.5">
            <Download className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              After the AI gives you the file, drop it into the upload box below. Charlotte parses it automatically.
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
