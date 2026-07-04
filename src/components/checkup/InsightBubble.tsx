import { useEffect, useState } from "react";

interface Props {
  x: number; y: number;
  title: string;
  insight: string;
  index: number; total: number;
  onNext: () => void;
  onSkip: () => void;
}

export function InsightBubble({ x, y, title, insight, index, total, onNext, onSkip }: Props) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShown(insight); return; }
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setShown(insight.slice(0, i));
      if (i >= insight.length) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [insight]);

  // Clamp inside the visible area: bubble appears above the node, shifted to stay on screen.
  const bubbleW = 280;
  const left = Math.max(12, Math.min(x - bubbleW / 2, (typeof window !== "undefined" ? window.innerWidth : 1200) - bubbleW - 12));
  const top = Math.max(12, y - 170);

  return (
    <div
      className="pointer-events-auto absolute z-50 animate-in fade-in zoom-in-95 duration-200"
      style={{ left, top, width: bubbleW }}
    >
      <div className="rounded-2xl border-2 border-foreground/80 bg-card text-card-foreground shadow-2xl p-4">
        <div className="flex items-baseline justify-between mb-1">
          <h4 className="text-sm font-bold tracking-tight">{title}</h4>
          <span className="text-[10px] text-muted-foreground">{index + 1} / {total}</span>
        </div>
        <p className="text-sm leading-snug min-h-[3.5rem]">{shown}<span className="opacity-40">{shown.length < insight.length ? "▍" : ""}</span></p>
        <div className="flex items-center justify-between mt-3 gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-xs font-semibold rounded-full bg-primary text-primary-foreground px-4 py-1.5 hover:opacity-90"
          >
            {index + 1 === total ? "Done" : "Next"}
          </button>
        </div>
      </div>
      {/* tail */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-card border-r-2 border-b-2 border-foreground/80"
        style={{ bottom: -7 }}
      />
    </div>
  );
}
