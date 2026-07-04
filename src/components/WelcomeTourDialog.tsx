import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, Receipt as ReceiptIcon, Fingerprint, Gauge, ArrowRight } from "lucide-react";
import { posthog } from "@/lib/posthog";

const TOUR_KEY_PREFIX = "charlotte:welcome_tour_seen:";
const DELAY_MS = 5000;

export function WelcomeTourDialog({ userId }: { userId: string | null | undefined }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const key = TOUR_KEY_PREFIX + userId;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(key)) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      posthog.capture("welcome_tour_shown", { user_id: userId });
    }, DELAY_MS);
    return () => window.clearTimeout(t);
  }, [userId]);

  const dismiss = (action: "dismiss" | "go_to_guide") => {
    if (userId && typeof window !== "undefined") {
      window.localStorage.setItem(TOUR_KEY_PREFIX + userId, new Date().toISOString());
    }
    posthog.capture("welcome_tour_dismissed", { action });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss("dismiss"); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Charlotte Labs</DialogTitle>
          <DialogDescription>
            A peer-reviewed lab for AI fluency. Here's the 30-second tour of how it works.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <TourRow icon={MessageSquare} title="1. Capture threads" body="Install the Chrome extension and chat with AI like you normally do (ChatGPT, Claude, Gemini, and more). Every conversation lands here as a Thread." />
          <TourRow icon={ReceiptIcon} title="2. Bundle into Receipts" body="Pick threads that go together and generate a Receipt — a one-page snapshot of how you collaborated, with a Fluency Radar across dimensions like Prompting, Verification, and Iteration." />
          <TourRow icon={Gauge} title="3. How it's scored" body="Each dimension shows evidence — Strong, Good, Limited, or Not enough yet — based on what the analyzer saw across your turns. One receipt is a snapshot, not a verdict." />
          <TourRow icon={Fingerprint} title="4. Build your Fingerprint" body="Over many receipts your Fingerprint sharpens. That long-term aggregate is the real picture of how you work with AI." />
        </div>

        <div className="rounded-md border-l-4 border-brand-mint bg-brand-mint/10 p-3 text-xs text-foreground">
          You're a <strong>co-researcher</strong>, not a test subject. You're anonymous-by-default in admin views.
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => dismiss("dismiss")}>Got it, skip the tour</Button>
          <Button asChild onClick={() => dismiss("go_to_guide")}>
            <Link to="/participant/how-it-works">Open the full guide<ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TourRow({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-card p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-mint/20 text-brand-navy">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm">
        <div className="font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
