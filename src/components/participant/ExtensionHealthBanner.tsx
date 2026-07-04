import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getExtensionHealth } from "@/serverfn/extension";
import { posthog } from "@/lib/posthog";

const DISMISS_KEY = "charlotte:ext-banner-dismissed-until";

export function ExtensionHealthBanner() {
  const fetchHealth = useServerFn(getExtensionHealth);
  const [health, setHealth] = useState<{
    status: "green" | "amber" | "red" | "unknown";
    message: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (until > Date.now()) setDismissed(true);
    fetchHealth().then(setHealth).catch(() => {});
  }, [fetchHealth]);

  useEffect(() => {
    if (!health || dismissed) return;
    if (health.status === "green") return;
    posthog.capture("extension_health_banner_viewed", { status: health.status });
  }, [health, dismissed]);

  if (!health || dismissed) return null;
  if (health.status === "green") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 3_600_000));
    posthog.capture("extension_health_banner_dismissed", { status: health.status });
    setDismissed(true);
  };

  const tone =
    health.status === "red"
      ? "border-destructive/40 bg-destructive/5 text-destructive-foreground"
      : "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10";
  const Icon = health.status === "red" ? AlertTriangle : Plug;

  return (
    <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm ${tone}`}>
      <Icon className={`h-4 w-4 shrink-0 ${health.status === "red" ? "text-destructive" : "text-amber-600"}`} />
      <span className="flex-1">{health.message}</span>
      <Button asChild size="sm" variant="outline">
        <Link
          to="/participant/extension"
          onClick={() => posthog.capture("extension_health_banner_cta_clicked", { status: health.status })}
        >
          Open Extension
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        aria-label="Dismiss for 24 hours"
        className="h-7 w-7"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
