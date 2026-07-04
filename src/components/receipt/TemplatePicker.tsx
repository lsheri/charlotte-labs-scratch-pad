import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { posthog } from "@/lib/posthog";

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  audience: "all" | "student" | "employee";
  promise: string;
  best_for: string | null;
  phase: number;
  status: "live" | "beta" | "hidden";
  sort_order: number;
};

interface Props {
  receiptId: string;
  existingRenderings: Array<{ template_key: string; created_at: string }>;
}

const CLASSIC_KEY = "classic_fluency";

export function TemplatePicker({ receiptId, existingRenderings }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["receipt-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipt_templates" as any)
        .select("*")
        .in("status", ["live", "beta"])
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TemplateRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Classic Fluency first; rest by sort_order.
  const templates = useMemo(() => {
    const list = data ?? [];
    const classic = list.find((t) => t.key === CLASSIC_KEY);
    const rest = list.filter((t) => t.key !== CLASSIC_KEY);
    return classic ? [classic, ...rest] : list;
  }, [data]);

  const lastRunByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of existingRenderings) {
      const prev = map.get(r.template_key);
      if (!prev || r.created_at > prev) map.set(r.template_key, r.created_at);
    }
    return map;
  }, [existingRenderings]);

  // Batched impression event (one posthog event, multiple DB rows).
  const impressionSent = useRef(false);
  useEffect(() => {
    if (impressionSent.current) return;
    if (!templates.length) return;
    impressionSent.current = true;
    const keys = templates.map((t) => t.key);
    posthog.capture("template_impression", { template_keys: keys, receipt_id: receiptId });
    if (userId) {
      for (const key of keys) {
        supabase
          .from("template_events" as any)
          .insert({ user_id: userId, template_key: key, event: "impression", receipt_id: receiptId } as any)
          .then(({ error }) => {
            if (error) console.error("[template_events] impression insert failed", error);
          });
      }
    }
  }, [templates, receiptId, userId]);

  const handleSelect = (key: string) => {
    posthog.capture("template_select", { template_key: key, receipt_id: receiptId });
    if (userId) {
      supabase
        .from("template_events" as any)
        .insert({ user_id: userId, template_key: key, event: "select", receipt_id: receiptId } as any)
        .then(({ error }) => {
          if (error) console.error("[template_events] select insert failed", error);
        });
    }
    navigate({
      to: "/participant/receipts/$receiptId",
      params: { receiptId },
      search: { template: key },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose how to read this receipt. Each view is a different lens on the same session.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm">
        <p className="mb-3 text-muted-foreground">Could not load templates.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!templates.length) {
    return <p className="text-sm text-muted-foreground">No templates available.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how to read this receipt. Each view is a different lens on the same session.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => {
          const lastRun = lastRunByKey.get(t.key);
          const isClassic = t.key === CLASSIC_KEY;
          return (
            <div
              key={t.id}
              className="rounded-xl border bg-card p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-[#0A2848]">{t.name}</h3>
                {t.status === "beta" && (
                  <span className="bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 text-xs">
                    Beta
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
                {t.promise}
              </p>
              {t.best_for && (
                <span className="text-xs border border-muted rounded-full px-2 py-0.5 w-fit">
                  Best for: {t.best_for}
                </span>
              )}
              {lastRun && (
                <span className="text-xs text-muted-foreground">
                  Last run: {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
                </span>
              )}
              <div className="mt-auto">
                <Button
                  className={
                    isClassic ? "w-full" : "w-full bg-[#0A2848] text-white hover:bg-[#0A2848]/90"
                  }
                  variant={isClassic ? "outline" : "default"}
                  onClick={() => handleSelect(t.key)}
                >
                  {isClassic ? "View" : "Generate"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
