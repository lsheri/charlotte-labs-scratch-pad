import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Stat = { value: string; label: string };
type Status = "proven" | "directional" | "hypothesis";

const statusStyles: Record<Status, string> = {
  proven: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  directional: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  hypothesis: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

const statusLabel: Record<Status, string> = {
  proven: "Proven",
  directional: "Directional",
  hypothesis: "Hypothesis",
};

function StatusTag({ kind }: { kind: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[kind]}`}
    >
      {statusLabel[kind]}
    </span>
  );
}

function StatCallout({ value, label }: Stat) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Slide1() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-8 px-8 py-12">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide 1
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          Why the U.S. invests in universities
        </h1>
      </div>
      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
        The federal and state government put real money behind higher ed because
        it's the country's core engine for teaching and producing the workforce.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCallout value="$130.7B" label="Record public higher-ed appropriations, FY2025 (SHEEO)" />
        <StatCallout value="10.8M" label="Public FTE enrollment, up 3.6% year over year (SHEEO)" />
        <StatCallout value="2 / 3" label="U.S. bachelor's degrees awarded by public institutions (APLU)" />
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-foreground/80">
        This is a deliberate national bet: educate students at massive scale to
        power the economy. That bet is now colliding with a technology shift
        nobody planned for.
      </p>
    </div>
  );
}

function Slide2() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-6 px-8 py-12">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide 2
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          AI has disrupted the bet, and nobody has measured the damage
        </h1>
      </div>
      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
        Schools are pouring money into AI access while reporting they can't see
        what it's doing.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCallout value="$13M / yr" label="CSU's renewed OpenAI contract, 3 years, signed mid-budget-crisis" />
        <StatCallout value="67%" label="CSU students say professors don't teach effective AI use (same survey)" />
        <StatCallout value="56%" label="Wage premium for AI-skilled workers (PwC)" />
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-foreground/80">
        The disruption is documented. What's missing is any system that tells a
        school whether its students are on the right or wrong side of that gap.
      </p>
    </div>
  );
}

function Slide3() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-6 px-8 py-12">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slide 3
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          The challenge, and what we'll show
        </h1>
      </div>
      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
        Faculty and students want different things from the same problem.
        Faculty want class-level visibility to redesign assignments and coach
        students. Students don't care about a fluency score. They care about not
        turning in work built on something AI got wrong, and knowing where
        they've leaned on AI so heavily they'll struggle on a heavily-weighted
        final. Meeting both from one product, without it feeling like a
        scoreboard or a surveillance tool, is the actual design problem.
      </p>
      <blockquote className="max-w-3xl border-l-2 border-primary/60 pl-4">
        <p className="text-base italic leading-relaxed text-foreground">
          "I need to see, at the class level, where students are leaning on AI
          so I can redesign the assignment."
        </p>
        <footer className="mt-2 text-xs text-muted-foreground">
          Faculty interview, unprompted
        </footer>
      </blockquote>
      <div>
        <div className="mb-3 text-sm font-semibold text-foreground">What we'll show</div>
        <ol className="space-y-3">
          <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              1
            </span>
            <div className="flex-1">
              <div className="text-sm text-foreground">
                A class-level fluency and tool-use view for faculty
              </div>
            </div>
            <StatusTag kind="directional" />
          </li>
          <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              2
            </span>
            <div className="flex-1">
              <div className="text-sm text-foreground">
                A pre-exam flag on where a student's own understanding may be
                thinner than their submitted work suggests
              </div>
            </div>
            <StatusTag kind="hypothesis" />
          </li>
          <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              3
            </span>
            <div className="flex-1">
              <div className="text-sm text-foreground">
                A verification check surfacing what in a student's AI-assisted
                work may not have been fact-checked
              </div>
            </div>
            <StatusTag kind="proven" />
          </li>
        </ol>
      </div>
    </div>
  );
}

const slides = [Slide1, Slide2, Slide3];

export function PitchDeck({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, slides.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const Current = slides[index];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="text-sm font-semibold tracking-tight">Charlotte Labs · Deck</div>
        <div className="flex items-center gap-4">
          <div className="text-xs tabular-nums text-muted-foreground">
            {index + 1} / {slides.length}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close deck">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-auto">
        <div key={index} className="animate-in fade-in duration-200 h-full">
          <Current />
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-6 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-3 bg-muted"
              }`}
            />
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
          disabled={index === slides.length - 1}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
