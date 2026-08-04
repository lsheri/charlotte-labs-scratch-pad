import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, ArrowLeft, ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getLatestAnalyzedReceiptId } from "@/serverfn/receipts";
import {
  PARTICIPANT_TOUR, DEPARTMENT_TOUR, ROADMAP_TOUR,
  type TourStep, type TourContext,
} from "./tourSteps";

type FlowId = "participant" | "department" | "roadmap";

const FLOWS: Record<FlowId, TourStep[]> = {
  participant: PARTICIPANT_TOUR,
  department: DEPARTMENT_TOUR,
  roadmap: ROADMAP_TOUR,
};


interface TourApi {
  start: (flow: FlowId) => void;
  stop: () => void;
  active: FlowId | null;
}

const Ctx = createContext<TourApi | undefined>(undefined);

const PAD = 8;

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [flow, setFlow] = useState<FlowId | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  const steps = flow ? FLOWS[flow] : [];
  const step = steps[index] ?? null;

  const stop = useCallback(() => {
    setFlow(null);
    setIndex(0);
    setRect(null);
  }, []);

  const fetchLatestReceipt = useServerFn(getLatestAnalyzedReceiptId);
  const [tourCtx, setTourCtx] = useState<TourContext>({ receiptId: null });

  const start = useCallback((f: FlowId) => {
    setFlow(f);
    setIndex(0);
    setRect(null);
    // Resolve a real receipt so the radar step always lands on real data.
    fetchLatestReceipt()
      .then((r: any) => setTourCtx({ receiptId: r?.receiptId ?? null }))
      .catch(() => setTourCtx({ receiptId: null }));
  }, [fetchLatestReceipt]);

  // Navigate to the step's route when needed.
  useEffect(() => {
    if (!step) return;
    const to = typeof step.to === "function" ? step.to(tourCtx) : step.to;
    if (to && to !== pathname) navigate({ to: to as any });
  }, [step, pathname, navigate, tourCtx]);

  // Clicking a sidebar link exits the tour instead of being trapped by it.
  useEffect(() => {
    if (!flow) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-tour-callout]")) return;
      if (t.closest('[data-sidebar], aside, nav, a[href], [role="navigation"]')) stop();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [flow, stop]);

  // Track the spotlight target; keeps up with layout shifts and async data.
  useEffect(() => {
    if (!step) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const el = step.target
        ? (document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null)
        : null;
      // Treat an empty/zero-size element as "not ready" rather than spotlighting
      // a blank box while its data is still loading.
      if (el && el.offsetHeight > 24 && el.offsetWidth > 24) {
        const r = el.getBoundingClientRect();
        const visible = r.top >= 0 && r.bottom <= window.innerHeight;
        if (!visible) el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(r);
      } else {
        setRect(null);
      }
      rafRef.current = window.setTimeout(() => requestAnimationFrame(tick), 200) as unknown as number;
    };
    tick();
    return () => {
      stopped = true;
      if (rafRef.current) window.clearTimeout(rafRef.current);
    };
  }, [step]);


  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        setFlow(null);
        return 0;
      }
      return i + 1;
    });
    setRect(null);
  }, [steps.length]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setRect(null);
  }, []);

  useEffect(() => {
    if (!flow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow, stop, next, back]);

  const api = useMemo<TourApi>(() => ({ start, stop, active: flow }), [start, stop, flow]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && flow && step
        ? createPortal(
            <TourOverlay
              step={step}
              rect={rect}
              index={index}
              total={steps.length}
              onNext={next}
              onBack={back}
              onExit={stop}
            />,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

export function useTour(): TourApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

function TourOverlay({
  step, rect, index, total, onNext, onBack, onExit,
}: {
  step: TourStep;
  rect: DOMRect | null;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}) {
  const calloutStyle = calloutPosition(rect, step.placement);

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70 transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(9, 14, 30, 0.62)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(9,14,30,0.62)]" />
      )}

      <div
        className="absolute w-[min(92vw,360px)] rounded-xl border bg-card p-4 shadow-2xl"
        style={calloutStyle}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Step {index + 1} of {total}
            </p>
            <h2 className="mt-1 text-base font-semibold leading-tight">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onExit} aria-label="Exit tour">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onBack} disabled={index === 0}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Button>
          <Button size="sm" onClick={onNext}>
            {index + 1 === total ? "Finish" : "Next"}
            {index + 1 < total && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function calloutPosition(rect: DOMRect | null, placement: TourStep["placement"] = "right") {
  const W = 360;
  const H = 210;
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  if (!rect) {
    return { top: vh / 2 - H / 2, left: vw / 2 - W / 2 } as const;
  }
  let top = rect.top;
  let left = rect.right + 20;
  if (placement === "left") left = rect.left - W - 20;
  if (placement === "bottom") { left = rect.left; top = rect.bottom + 16; }
  if (placement === "top") { left = rect.left; top = rect.top - H - 16; }
  // Fall back to the other side / clamp inside the viewport.
  if (left + W > vw - 12) left = Math.max(12, rect.left - W - 20);
  if (left < 12) left = Math.min(vw - W - 12, rect.right + 20);
  if (left < 12) left = 12;
  if (top + H > vh - 12) top = Math.max(12, vh - H - 12);
  if (top < 12) top = 12;
  return { top, left } as const;
}
