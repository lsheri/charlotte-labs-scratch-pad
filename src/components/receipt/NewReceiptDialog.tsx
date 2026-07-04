import { useState, KeyboardEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
  type WorkflowType,
  PURPOSES,
  PURPOSE_LABELS,
  type Purpose,
  SUGGESTED_TAGS,
  normalizeTag,
  PROVENANCE,
  PROVENANCE_LABELS,
  type Provenance,
} from "@/lib/displayNames";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import { posthog } from "@/lib/posthog";

export interface NewReceiptDialogValue {
  name: string;
  goal?: string;
  workflowType: WorkflowType;
  workflowTypeSet: boolean;
  workflowTypeExtras: WorkflowType[];
  workflowTypeCustom?: string;
  purpose: Purpose | null;
  tags: string[];
  saveAsTemplate: boolean;
  provenance: Provenance;
  provenanceUserOverride: boolean;
}

interface Props {
  open: boolean;
  threadCount: number;
  defaultName?: string;
  busy?: boolean;
  /** Auto-detected: any selected thread came from a research session. */
  inSession?: boolean;
  /** Workflows submitted in the rolling 24h window. */
  dailyUsed?: number;
  /** Daily cap (default 4). */
  dailyLimit?: number;
  dailyLimitExempt?: boolean;
  onCancel: () => void;
  onSubmit: (v: NewReceiptDialogValue) => void;
}

export function NewReceiptDialog({
  open,
  threadCount,
  defaultName,
  busy,
  inSession,
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
  /** Ordered list: index 0 is PRIMARY (drives recs/analysis). Up to 3 total. */
  const [typeSelection, setTypeSelection] = useState<WorkflowType[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const primaryType: WorkflowType | null = typeSelection[0] ?? null;
  const extraTypes: WorkflowType[] = typeSelection.slice(1, 3);
  const [purpose, setPurpose] = useState<Purpose | "__unset__">("__unset__");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const autoProvenance: Provenance = inSession ? "lab" : "personal";
  const [provenance, setProvenance] = useState<Provenance>(autoProvenance);
  const provenanceUserOverride = provenance !== autoProvenance;

  const toggleType = (t: WorkflowType) => {
    setTypeSelection((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 3) return prev; // cap 3
      return [...prev, t];
    });
  };
  const promoteToPrimary = (t: WorkflowType) => {
    setTypeSelection((prev) => {
      const without = prev.filter((x) => x !== t);
      return [t, ...without].slice(0, 3);
    });
  };

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t || tags.includes(t) || tags.length >= 5) return;
    setTags([...tags, t]);
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const submit = () => {
    const explicit = primaryType !== null;
    const customClean = customLabel.trim().slice(0, 32);
    const customValid = primaryType !== "custom" || customClean.length > 0;
    if (!customValid) return; // guard handled by button disabled state too
    posthog.capture("receipt_dialog_submitted", {
      thread_count: threadCount,
      workflow_type: primaryType,
      workflow_type_set: explicit,
      workflow_type_extras: extraTypes,
      workflow_type_count: typeSelection.length,
      workflow_type_custom: primaryType === "custom" ? customClean : null,
      purpose: purpose === "__unset__" ? null : purpose,
      tag_count: tags.length,
      has_goal: Boolean(goal.trim()),
      save_as_template: saveAsTemplate,
      provenance,
      provenance_user_override: provenanceUserOverride,
      in_session: Boolean(inSession),
      daily_used: dailyUsed,
      daily_limit: dailyLimit,
    });
    onSubmit({
      name: name.trim(),
      goal: goal.trim() || undefined,
      workflowType: (primaryType ?? "other") as WorkflowType,
      workflowTypeSet: explicit,
      workflowTypeExtras: extraTypes,
      workflowTypeCustom: primaryType === "custom" ? customClean : undefined,
      purpose: purpose === "__unset__" ? null : (purpose as Purpose),
      tags,
      saveAsTemplate,
      provenance,
      provenanceUserOverride,
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
          <DialogTitle>New AI Collaboration Workflow</DialogTitle>
          <DialogDescription>
            Bundling {threadCount} thread{threadCount === 1 ? "" : "s"}. Pick an output type to make
            this a tracked workflow on your fingerprint, or leave it blank to keep this as a plain
            receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wf-name" className="text-sm font-semibold">
              Name this receipt{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (you can change it later)
              </span>
            </Label>
            <Input
              id="wf-name"
              placeholder="e.g. Landing page rewrite"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              autoFocus
              className="text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wf-goal">
              What are you trying to accomplish?{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (optional — makes your recommendations personal)
              </span>
            </Label>
            <Textarea
              id="wf-goal"
              placeholder="e.g. Debug why my login form keeps firing twice"
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 200))}
              rows={2}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {goal.length}/200 · Charlotte uses this to personalize your recommendations.
            </p>
          </div>

          {/* Provenance — Lab Work vs Personal Tinkering */}
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                Provenance
                {inSession && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    auto-detected from session
                  </span>
                )}
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROVENANCE.map((p) => {
                const active = provenance === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvenance(p)}
                    className={
                      "flex items-center gap-2 rounded-md border p-2 text-left transition " +
                      (active
                        ? "border-primary bg-background ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40 bg-background/60")
                    }
                  >
                    <ProvenanceVial variant={p} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">
                        {PROVENANCE_LABELS[p]}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        {p === "lab"
                          ? "Class, bootcamp, or hackathon"
                          : "Self-directed exploration"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Verified Lab Work (with the green check) is awarded by an admin or instructor — see
              your fingerprint.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Output types</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Pick up to 3. The{" "}
              <span className="font-semibold text-orange-600">
                first one you pick is the primary
              </span>{" "}
              — it drives Charlotte's analysis & recommendations. The other two are just tags so you
              can find this later.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WORKFLOW_TYPES.map((t) => {
                const idx = typeSelection.indexOf(t);
                const isPrimary = idx === 0;
                const isExtra = idx > 0;
                const atCap = !isPrimary && !isExtra && typeSelection.length >= 3;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    disabled={atCap}
                    className={
                      "px-2.5 py-1 rounded-full text-xs border transition " +
                      (isPrimary
                        ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                        : isExtra
                          ? "bg-orange-100 text-orange-900 border-orange-300"
                          : "bg-background border-border hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed")
                    }
                    aria-pressed={isPrimary || isExtra}
                    title={
                      isPrimary
                        ? "Primary type — drives analysis & recommendations"
                        : isExtra
                          ? "Secondary tag"
                          : "Click to add"
                    }
                  >
                    {isPrimary && <span className="mr-1">★</span>}
                    {WORKFLOW_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            {primaryType === "custom" && (
              <Input
                placeholder="Name your custom output type (max 32 chars)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value.slice(0, 32))}
                className="mt-1"
                autoFocus
              />
            )}
            {extraTypes.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Tip: click an active secondary type again to remove it, or click a different type to
                promote it.{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => extraTypes[0] && promoteToPrimary(extraTypes[0])}
                >
                  Make "{WORKFLOW_TYPE_LABELS[extraTypes[0]]}" primary
                </button>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Leaving this empty keeps it as a plain receipt (no workflow tracking). Multi-tool
              receipts always count as workflows.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Not specified</SelectItem>
                {PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PURPOSE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Tags <span className="text-muted-foreground text-xs">(optional — up to 5)</span>
            </Label>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder={tags.length >= 5 ? "Max 5 tags" : "Type tag, press Enter (or skip)"}
              value={tagInput}
              disabled={tags.length >= 5}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKey}
            />
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t))
                .slice(0, 8)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    disabled={tags.length >= 5}
                    className="px-2 py-0.5 rounded-full text-[11px] border hover:border-primary/60 disabled:opacity-40"
                  >
                    + {t}
                  </button>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tags.length === 0
                ? "Tip: one tag (try a suggestion above) makes your fingerprint sharper later. You can still skip and submit."
                : `${tags.length} tag${tags.length === 1 ? "" : "s"} added.`}
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <Label htmlFor="save-template" className="cursor-pointer">
                Save as a reusable template
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Reuse this tool stack + tags later.
              </p>
            </div>
            <Switch
              id="save-template"
              checked={saveAsTemplate}
              onCheckedChange={setSaveAsTemplate}
            />
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
              <>Workflow generation limit waived for this account.</>
            ) : overCap ? (
              <>
                <span className="font-medium">
                  {dailyUsed} of {dailyLimit}
                </span>{" "}
                workflows used in the last 24h. You've hit today's limit — try again in 24h.
              </>
            ) : (
              <>
                <span className="font-medium">
                  {dailyUsed} of {dailyLimit}
                </span>{" "}
                workflows used in the last 24h. We cap at {dailyLimit}/day so each workflow gets
                real reflection. Quality {">"}quantity: a few thoughtful receipts teach Charlotte
                more than a flood of rushed ones.
              </>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={busy || overCap || (primaryType === "custom" && !customLabel.trim())}
            >
              Generate Receipt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
