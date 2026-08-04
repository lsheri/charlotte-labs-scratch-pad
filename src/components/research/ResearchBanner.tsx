import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { X, Play, Home } from "lucide-react";
import { useTour } from "@/components/tour/TourProvider";
import { DEMOS } from "@/components/tour/demos";


const DISMISS_KEY = "charlotte_banner_dismissed_at";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow(pathname: string) {
  return pathname.startsWith("/participant") || pathname.startsWith("/admin");
}

export function ResearchBanner() {
  const { pathname } = useLocation();
  const { start, active } = useTour();
  const [dismissed, setDismissed] = useState(true); // hide by default until we read storage


  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DISMISS_KEY);
    if (!stored) {
      setDismissed(false);
      return;
    }
    const ts = Number(stored);
    if (Number.isFinite(ts) && Date.now() - ts < SEVEN_DAYS_MS) {
      setDismissed(true);
    } else {
      setDismissed(false);
      window.localStorage.removeItem(DISMISS_KEY);
    }
  }, []);

  if (!shouldShow(pathname) || dismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Demo navigation"
      className="sticky top-0 z-50 w-full bg-brand-navy text-brand-cream shadow-sm relative"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-xs sm:text-sm">
        <p className="leading-tight">
          <span className="hidden sm:inline">You're viewing a Charlotte Labs product demo.</span>
          <span className="sm:hidden font-medium">Charlotte Labs demo</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/participant/demo"
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm transition hover:bg-amber-300"
          >
            <Home className="h-3 w-3" /> Demo Home
          </Link>
          {DEMOS.map((d) => (
            <button
              key={d.id}
              onClick={() => start(d.id)}
              disabled={!!active}
              className="inline-flex items-center gap-1 rounded-full border border-brand-mint/60 bg-brand-mint px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-navy shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              <span className="hidden md:inline">{d.label}</span>
              <span className="md:hidden">{d.shortLabel}</span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">

          <button
            onClick={dismiss}
            aria-label="Dismiss banner"
            className="rounded p-1 text-brand-cream/70 hover:bg-white/10 hover:text-brand-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>


    </div>
  );
}
