import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { SpiderMascot } from "@/components/checkup/SpiderMascot";
import { InsightBubble } from "@/components/checkup/InsightBubble";
import type { ReceiptTourStop } from "@/serverfn/receipt-checkup";

interface Props {
  stops: ReceiptTourStop[];
  onClose: () => void;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function ReceiptCheckup({ stops, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number; angle: number }>(() => ({
    x: typeof window !== "undefined" ? window.innerWidth - 80 : 600,
    y: -60, angle: 180,
  }));
  const [arrived, setArrived] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Resolve next target by scrolling its [data-tour] section into view
  useEffect(() => {
    if (!stops.length) return;
    const stop = stops[index];
    const el = document.querySelector(`[data-tour="${stop.section}"]`) as HTMLElement | null;
    if (!el) { setArrived(true); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setArrived(false);
    // Wait for scroll, then compute target
    const settle = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const target = { x: Math.min(window.innerWidth - 60, r.right + 30), y: Math.max(60, r.top + 40) };
      if (reducedMotion()) {
        setPos({ x: target.x, y: target.y, angle: 0 });
        setArrived(true);
        return;
      }
      const start = { ...pos };
      const dx = target.x - start.x, dy = target.y - start.y;
      const dist = Math.hypot(dx, dy);
      const dur = Math.min(1400, 350 + dist * 1.2);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setPos({ x: start.x + dx * eased, y: start.y + dy * eased, angle });
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else setArrived(true);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 450);
    return () => {
      window.clearTimeout(settle);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stops]);

  if (!stops.length) return null;
  const stop = stops[index];

  const handleNext = () => {
    if (index + 1 >= stops.length) {
      // crawl off screen
      setPos({ x: window.innerWidth + 80, y: pos.y, angle: 0 });
      setTimeout(onClose, 600);
    } else setIndex(i => i + 1);
  };

  return (
    <>
      <button
        type="button" onClick={onClose}
        className="fixed top-4 right-4 z-[60] p-2 rounded-full bg-card border shadow hover:bg-accent"
        aria-label="Close tour"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="fixed inset-0 pointer-events-none z-50">
        <SpiderMascot x={pos.x} y={pos.y} angle={pos.angle} />
        {arrived && (
          <InsightBubble
            x={pos.x} y={pos.y}
            title={stop.title}
            insight={stop.insight}
            index={index} total={stops.length}
            onNext={handleNext} onSkip={onClose}
          />
        )}
      </div>
    </>
  );
}
