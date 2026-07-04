import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, ShieldAlert, Target } from "lucide-react";
import { posthog } from "@/lib/posthog";

export type TemplateKey = "classic_fluency" | "verification_risk" | "study_gaps";

export interface NewReceiptDialogValue {
  name: string;
  goal?: string;
  templates: TemplateKey[];
}

interface Props {
  open: boolean;
  threadCount: number;
  defaultName?: string;
  busy?: boolean;
  inSession?: boolean;
  dailyUsed?: number;
  dailyLimit?: number;
  dailyLimitExempt?: boolean;
  onCancel: () => void;
  onSubmit: (v: NewReceiptDialogValue) => void;
}

const OPTIONS: {
  key: TemplateKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "classic_fluency",
    title: "Academic Fluency",
    description: "How well you're partnering with AI — behaviors, dimensions, and coaching.",
    icon: GraduationCap,
  },
  {
    key: "verification_risk",
    title: "Verification & Risk",
    description: "Unverified claims and hallucination-prone outputs to double-check.",
    icon: ShieldAlert,
  },
  {
    key: "study_gaps",
    title: "Study Gaps",
    description: "What you still need to practice without AI before the exam.",
    icon: Target,
  },
];

export function NewReceiptDialog({
  open,
  threadCount,
  defaultName,
  busy,
  dailyUsed = 0,
  dailyLimit = 7,
  dailyLimitExempt = false,
  onCancel,
  onSubmit,
}: Props) {
  const projected = dailyUsed + 1;
  const overCap = !dailyLimitExempt && projected > dailyLimit;
  const nearCap = !dailyLimitExempt && !overCap && projected >= dailyLimit;
  const [name, setName] = useState(defaultName ?? "");
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState<Set<TemplateKey>>(
    new Set<TemplateKey>(["classic_fluency", "verification_risk", "study_gaps"]),
  );

  const toggle = (k: TemplateKey) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const templates = Array.from(selected);
  const nothingSelected = templates.length === 0;

  const submit = () => {
    posthog.capture("receipt_dialog_submitted", {
      thread_count: threadCount,
      templates,
      has_goal: Boolean(goal.trim()),
    });
    onSubmit({
      name: name.trim(),
      goal: goal.trim() || undefined,
      templates,
    });
  };

  const cancel = () => {
    posthog.capture("receipt_dialog_cancelled", { thread_count: threadCount });
    onCancel();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
    >
      <DialogContent className="max-w-lg flex max-h-[90vh] flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>New study receipt</DialogTitle>
          <DialogDescription>
            Bundling {threadCount} thread{threadCount === 1 ? "" : "s"}. Pick what Charlotte
            should generate — at least one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wf-name" className="text-sm font-semibold">
              Name this receipt{" "}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Input
              id="wf-name"
              placeholder="e.g. HW4 — Linear Algebra"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              autoFocus
              className="text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wf-goal">
              What are you studying / trying to learn?{" "}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Textarea
              id="wf-goal"
              placeholder="e.g. Prep for Wednesday's midterm on eigenvectors"
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 200))}
              rows={2}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">{goal.length}/200</p>
          </div>

          <div className="space-y-2">
            <Label>What should Charlotte generate?</Label>
            <div className="space-y-2">
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = selected.has(opt.key);
                return (
                  <label
                    key={opt.key}
                    className={
                      "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
                      (checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40")
                    }
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(opt.key)}
                      className="mt-0.5"
                    />
                    <Icon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{opt.title}</div>
                      <div className="text-xs text-muted-foreground">{opt.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            {nothingSelected && (
              <p className="text-[11px] text-destructive">Pick at least one.</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between border-t px-6 py-3 bg-background">
          <div
            className={
              "text-[11px] leading-snug " +
              (overCap ? "text-destructive" : nearCap ? "text-amber-600" : "text-muted-foreground")
            }
          >
            {dailyLimitExempt ? (
              <>Daily generation limit waived for this account.</>
            ) : overCap ? (
              <>
                <span className="font-medium">
                  {dailyUsed} of {dailyLimit}
                </span>{" "}
                receipts used in the last 24h. Try again in 24h.
              </>
            ) : (
              <>
                <span className="font-medium">
                  {dailyUsed} of {dailyLimit}
                </span>{" "}
                receipts used in the last 24h.
              </>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || overCap || nothingSelected}>
              Generate Receipt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
