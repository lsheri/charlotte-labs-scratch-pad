import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { X, Bug } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { TeamOutreachPanel } from "./TeamOutreachPanel";

const DISMISS_KEY = "charlotte_banner_dismissed_at";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/participant");
}

export function ResearchBanner() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(true); // hide by default until we read storage
  const [openTab, setOpenTab] = useState<"team" | "bug">("team");
  const [open, setOpen] = useState(false);

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

  const openWith = (tab: "team" | "bug") => {
    setOpenTab(tab);
    setOpen(true);
  };

  const Trigger = ({ tab, children }: { tab: "team" | "bug"; children: React.ReactNode }) => (
    <button
      onClick={() => openWith(tab)}
      className="font-medium text-brand-mint underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Research banner"
      className="sticky top-0 z-50 w-full bg-brand-navy text-brand-cream shadow-sm relative"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:text-sm">
        <span className="hidden sm:inline" aria-hidden>🔬</span>
        <p className="flex-1 truncate leading-tight">
          <span className="hidden sm:inline">
            This tool is being built through peer-reviewed research — in collaboration with students and builders like you.
          </span>
          <span className="sm:hidden">🔬 Research preview</span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Trigger tab="team">Connect with the team →</Trigger>
            <span className="text-brand-cream/40">·</span>
            <button
              onClick={() => openWith("bug")}
              className="inline-flex items-center gap-1 font-medium text-brand-cream/90 hover:text-brand-mint"
            >
              <Bug className="h-3 w-3" /> Report a bug
            </button>
          </span>
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="rounded p-1 text-brand-cream/70 hover:bg-white/10 hover:text-brand-cream"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="hidden" />
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Charlotte Labs</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <TeamOutreachPanel initialTab={openTab} onClose={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span className="absolute left-1/2 top-full block h-0 w-0" />
          </PopoverTrigger>
          <PopoverContent
            align="center"
            sideOffset={4}
            className="w-[min(640px,calc(100vw-2rem))] p-4"
          >
            <TeamOutreachPanel initialTab={openTab} onClose={() => setOpen(false)} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
