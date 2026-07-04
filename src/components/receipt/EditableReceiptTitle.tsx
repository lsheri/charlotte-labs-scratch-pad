import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { renameReceipt } from "@/serverfn/receipts";
import { getReceiptDisplayName, type ReceiptLike } from "@/lib/displayNames";
import { posthog } from "@/lib/posthog";

interface Props {
  receipt: ReceiptLike & { id: string };
  /** Hide the edit affordance in admin / read-only contexts. */
  readOnly?: boolean;
}

/**
 * Inline-editable receipt title. Writes to receipts.metadata.label via the
 * `renameReceipt` server fn, then invalidates the loader + any cached
 * receipt queries so every surface (this page + the dashboard chips) picks
 * up the new name immediately.
 */
export function EditableReceiptTitle({ receipt, readOnly = false }: Props) {
  const display = getReceiptDisplayName(receipt);
  const hasCustomLabel = Boolean(((receipt.metadata as any) ?? {}).label);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hasCustomLabel ? display : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rename = useServerFn(renameReceipt);
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const next = value.trim();
    const current = hasCustomLabel ? display : "";
    if (next === current) { setEditing(false); return; }
    setSaving(true);
    try {
      await rename({ data: { receiptId: receipt.id, label: next } });
      posthog.capture("receipt_renamed", {
        receipt_id: receipt.id,
        had_custom_label: hasCustomLabel,
        cleared: next === "",
        new_length: next.length,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["receipt-with-fluency", receipt.id] }),
        qc.invalidateQueries({ queryKey: ["overall-fluency-snapshot"] }),
        router.invalidate(),
      ]);
      toast.success(next ? "Receipt renamed" : "Name cleared");
      setEditing(false);
    } catch (e: any) {
      posthog.capture("receipt_rename_failed", { receipt_id: receipt.id, error: e?.message });
      toast.error(e?.message || "Couldn't save name");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(hasCustomLabel ? display : "");
    setEditing(false);
  }

  if (readOnly) {
    return <span className="truncate">{display}</span>;
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-center gap-2 min-w-0 flex-1"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <input
          ref={inputRef}
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          placeholder="Name this receipt…"
          disabled={saving}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-base font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-50"
          aria-label="Save name"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-50"
          aria-label="Cancel rename"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">{display}</span>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100"
        aria-label="Rename receipt"
        title={hasCustomLabel ? "Rename receipt" : "Name this receipt"}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
