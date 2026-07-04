import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MessageSquare,
  Receipt as ReceiptIcon,
  Fingerprint,
  Workflow,
  Plug,
  UserPlus,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolLogo } from "@/components/ToolLogo";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import { FluencyRadarChart } from "@/components/receipt/FluencyRadarChart";
import charlotteMascot from "@/assets/charlotte-mascot.png";

export const Route = createFileRoute("/participant/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Charlotte works — your AI fluency lab" },
      {
        name: "description",
        content:
          "A step-by-step guide to Charlotte Labs: installing the extension, capturing threads, generating receipts, and building your AI fingerprint over time.",
      },
      { property: "og:title", content: "How Charlotte works" },
      {
        property: "og:description",
        content:
          "From your first thread to your long-term AI fingerprint — here's how Charlotte builds your AI fluency profile over time.",
      },
    ],
  }),
  component: HowItWorksPage,
});

const SUPPORTED_TOOLS = ["chatgpt", "claude", "gemini", "copilot", "lovable"];

const STEPS = [
  { id: "welcome", num: null, title: "What Charlotte is" },
  { id: "account", num: 1, title: "Create your account" },
  { id: "extension", num: 2, title: "Install the extension" },
  { id: "chat", num: 3, title: "Have normal AI chats" },
  { id: "receipt", num: 4, title: "Generate a Receipt" },
  { id: "read", num: 5, title: "Read your Receipt" },
  { id: "scoring", num: 6, title: "How it's scored" },
  { id: "fingerprint", num: 7, title: "Build your Fingerprint" },
  { id: "workflows", num: 8, title: "Workflows (optional)" },
  { id: "help", num: null, title: "Need help?" },
] as const;

const SAMPLE_RADAR = [
  { label: "Prompting", value: 78 },
  { label: "Verification", value: 62 },
  { label: "Iteration", value: 71 },
  { label: "Synthesis", value: 55 },
  { label: "Tool Choice", value: 80 },
  { label: "Reflection", value: 48 },
];

function StepCard({
  id,
  num,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  num: number | null;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
        {num !== null ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-mint/20 text-sm font-bold text-brand-navy">
            {num}
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <CardTitle className="flex items-center gap-2 text-lg">
          {num !== null && <Icon className="h-5 w-5 text-muted-foreground" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function HowItWorksPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_220px]">
      <div className="space-y-6">
        {/* Hero */}
        <div className="rounded-xl border bg-gradient-to-br from-brand-navy to-[#143a63] p-6 text-brand-cream">
          <div className="flex items-start gap-4">
            <img src={charlotteMascot} alt="Charlotte" className="h-16 w-16 shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold">How Charlotte works</h1>
              <p className="mt-1 max-w-2xl text-sm text-brand-cream/80">
                A peer-reviewed lab for AI fluency. You bring the everyday AI
                conversations you're already having — Charlotte turns them
                into a long-term picture of how you think and work with AI.
              </p>
            </div>
          </div>
        </div>

        <StepCard id="welcome" num={null} icon={Sparkles} title="What Charlotte is">
          <p>
            Charlotte helps you <strong>see how you actually use AI</strong> —
            turning your everyday conversations into a clear picture you can
            learn from. The point is simple: <strong>visualize your AI use,
            improve your fluency, and build an AI Fingerprint</strong> that's
            uniquely yours.
          </p>
          <p>
            The mental model: <strong>Threads → Receipts → Fingerprint</strong>.
            Threads are raw AI conversations. Receipts are analyzed snapshots
            of how you collaborated. Your Fingerprint is the long-term
            aggregate — that's the real picture.
          </p>
        </StepCard>

        <StepCard id="account" num={1} icon={UserPlus} title="Create your account">
          <p>
            You already did this — welcome. Make sure you've reviewed the
            consent banner. Inside the app you can use everything freely;
            inside our admin views, you appear as something like{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Participant-7F3A</code>{" "}
            until you choose to be identified.
          </p>
        </StepCard>

        <StepCard id="extension" num={2} icon={Plug} title="Install the Chrome extension">
          <p>
            The extension silently captures your AI conversations as they
            happen, so you don't have to copy-paste anything. We support these
            tools out of the box:
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3">
            {SUPPORTED_TOOLS.map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-foreground">
                <ToolLogo tool={t} size={22} />
                <span className="capitalize">{t}</span>
              </div>
            ))}
          </div>
          <p>
            Don't see your tool, or working from a phone where the extension
            can't reach? You can <strong>add a thread manually</strong> instead.
          </p>
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="mb-1 font-semibold text-foreground">How manual import works</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Go to <strong>Threads</strong> and click <strong>Add manually</strong>.
              </li>
              <li>
                Copy the <strong>Charlotte export prompt</strong> at the top of
                that page and paste it into your AI chat — it asks the model to
                spit your conversation back as a clean transcript.
              </li>
              <li>
                Save the reply as a <code className="rounded bg-muted px-1 py-0.5 text-xs">.txt</code> or{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">.md</code> file
                (or just copy the text), then drop it into the upload box. For
                .docx, copy the text and paste it in.
              </li>
              <li>
                Charlotte parses the turns automatically. Click any turn to
                flip its role if we got it wrong, set the AI tool, give it a
                title, and create the thread.
              </li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Manual threads behave exactly like captured ones — they roll into
              receipts and your Fingerprint.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/participant/extension">
                Go to Extension setup <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/participant/threads/new">
                Add a thread manually <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </StepCard>

        <StepCard id="chat" num={3} icon={MessageSquare} title="Have normal AI chats">
          <p>
            No special prompts, no scripts, no performance. Just work the way
            you already work. Each captured chat shows up as a{" "}
            <strong>Thread</strong> — you'll see the tool, message count, and
            an auto-generated summary.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/participant/threads">
              Open Threads <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </StepCard>

        <StepCard id="receipt" num={4} icon={ReceiptIcon} title="Generate a Receipt">
          <p>
            Pick one or more Threads that go together (e.g. all the chats
            behind one piece of work) and click <strong>Generate Receipt</strong>.
            On the next screen you'll <strong>confirm the workflow steps</strong>:
            name it, set a goal, add tags, and label provenance.
          </p>

          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="mb-1 font-semibold text-foreground">What happens after you click generate</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Most receipts finish in <strong>15–30 seconds</strong>. Long
                transcripts (lots of turns) can take a minute or two — you can
                close the tab and come back, the work continues in the background.
              </li>
              <li>
                If our AI provider is temporarily busy, your receipt is{" "}
                <strong>automatically retried in about an hour</strong>. You'll
                see a "Rate-limited" badge in the meantime — no action needed,
                but you can hit "Retry now" if you don't want to wait.
              </li>
              <li>
                If you select threads from <strong>both your Personal workspace
                and a Research workspace</strong>, you'll get <strong>two
                receipts</strong> — one per workspace. This keeps your personal
                data out of any study and your session data correctly attributed.
              </li>
            </ul>
          </div>

          <div className="rounded-md border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
              Provenance — every receipt is one of two kinds
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">
                <ProvenanceVial variant="lab" size="lg" />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">Lab Work</div>
                  <div className="text-muted-foreground">Institutional sessions. Auto-tagged.</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">
                <ProvenanceVial variant="personal" size="lg" />
                <div className="text-xs">
                  <div className="font-semibold text-foreground">Personal Tinkering</div>
                  <div className="text-muted-foreground">Everyday AI use. Just as valuable.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
              Tags — describe what you were doing
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["research", "writing", "debugging", "brainstorm", "analysis", "learning"].map((t) => (
                <Badge key={t} variant="secondary" className="capitalize">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </StepCard>

        <StepCard id="read" num={5} icon={ReceiptIcon} title="Read your Receipt">
          <p>
            Each receipt has a few parts — here's the most recognizable one,
            the <strong>Fluency Radar</strong>. Each axis is a dimension of how
            you collaborated with the AI on this piece of work:
          </p>
          <div className="rounded-md border bg-card p-2">
            <div className="h-[320px]">
              <FluencyRadarChart dimensions={SAMPLE_RADAR} compact />
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Patterns</strong> — recurring habits we noticed.</li>
            <li><strong>Audit trail</strong> — what the analyzer actually saw.</li>
            <li><strong>Recommendations</strong> — concrete next-step prompts to try.</li>
          </ul>
          <div className="rounded-md border-l-4 border-brand-mint bg-brand-mint/10 p-3 text-foreground">
            <strong>One receipt is a snapshot, not a verdict.</strong> Scores
            wobble across sessions. The signal lives in the trend over time.
          </div>
        </StepCard>

        <StepCard id="scoring" num={6} icon={Gauge} title="How it's scored">
          <p>
            Each receipt is analyzed across the same set of dimensions
            (prompting, verification, iteration, synthesis, tool choice,
            reflection, and more). For every dimension we report an{" "}
            <strong>evidence band</strong> — not a raw number — based on what
            the analyzer actually saw in your turns:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border bg-[#EAF4E0] p-3 text-xs">
              <div className="font-semibold text-[#1a5020]">Strong evidence</div>
              <div className="text-[#1a5020]/80">Repeated, clear signal across turns.</div>
            </div>
            <div className="rounded-md border bg-[#E0F0F0] p-3 text-xs">
              <div className="font-semibold text-[#1a5858]">Good evidence</div>
              <div className="text-[#1a5858]/80">Consistent signal, some variation.</div>
            </div>
            <div className="rounded-md border bg-[#FBF2E0] p-3 text-xs">
              <div className="font-semibold text-[#7a5010]">Limited evidence</div>
              <div className="text-[#7a5010]/80">Some signal, but thin or one-off.</div>
            </div>
            <div className="rounded-md border bg-[#F4F0E8] p-3 text-xs">
              <div className="font-semibold text-[#6a5838]">Not enough evidence yet</div>
              <div className="text-[#6a5838]/80">Nothing the analyzer could anchor on.</div>
            </div>
          </div>
          <p>
            Across many receipts, your Fingerprint also shows an{" "}
            <strong>overall band</strong> — Emerging, Developing, Proficient,
            or Strong — that reflects the long-term shape of your collaboration.
          </p>
          <p>
            The audit trail on every receipt shows exactly which turns drove
            each dimension, so the score is always inspectable. If something
            looks off, that's signal worth telling us.
          </p>
        </StepCard>

        <StepCard id="fingerprint" num={7} icon={Fingerprint} title="Build your Fingerprint over time">
          <p>
            Your <strong>Fingerprint</strong> is the long-term aggregate of
            every receipt you've generated. This is where the real picture
            shows up — your dominant strengths, the dimensions you're growing
            in, and the way your collaboration style evolves.
          </p>
          <p>
            Generate receipts as you naturally work, and check back in
            weekly-ish. You'll watch the shape sharpen.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/participant/fingerprint">
              Open your Fingerprint <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </StepCard>

        <StepCard id="workflows" num={8} icon={Workflow} title="Workflows (optional)">
          <p>
            When a receipt spans multiple tools (e.g. ChatGPT → Claude →
            Lovable), it auto-promotes to a <strong>Workflow</strong>. You can
            save it as a reusable template and — opt-in only — share it with
            the community so others can learn from your stack.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/participant/workflows">
              See Workflows <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </StepCard>

        <StepCard id="help" num={null} icon={HelpCircle} title="Need help?">
          <p>
            Use the support banner at the top of the page —{" "}
            <strong>Connect with the team</strong> for any question or
            feedback, or <strong>Report a bug</strong> if something looks off.
            We read everything.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <CharlotteLogo className="h-8 w-8" />
            <span className="text-xs text-muted-foreground">
              Thanks for being part of the lab. — Charlotte Labs
            </span>
          </div>
        </StepCard>
      </div>

      {/* Sticky TOC (desktop) */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-md border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <nav className="flex flex-col gap-1 text-sm">
            {STEPS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s.num !== null ? `${s.num}. ` : ""}{s.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}
