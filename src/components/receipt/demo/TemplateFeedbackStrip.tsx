import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { submitTemplateFeedback } from "@/lib/demo-feedback.functions";

interface Props {
  templateKey: string;
  templateName: string;
  receiptId: string;
}

export function TemplateFeedbackStrip({
  templateKey,
  templateName,
  receiptId,
}: Props) {
  const submit = useServerFn(submitTemplateFeedback);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSend() {
    if (!rating) {
      toast.error("Pick a thumbs up or down first.");
      return;
    }
    setSubmitting(true);
    try {
      await submit({
        data: {
          template_key: templateKey,
          rating,
          comment: comment.trim() || null,
          receipt_id: receiptId,
        },
      });
      setSubmitted(true);
      toast.success(`Thanks for the feedback on ${templateName}.`);
    } catch (e) {
      toast.error(
        `Could not save feedback: ${(e as Error).message ?? "unknown error"}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        Got it — thanks for rating <strong>{templateName}</strong>. You can keep
        scrolling.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          How does this land?
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Thumbs up"
            onClick={() => setRating("up")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              rating === "up"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "hover:bg-emerald-50 hover:border-emerald-300",
            )}
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Thumbs down"
            onClick={() => setRating("down")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
              rating === "down"
                ? "border-red-500 bg-red-500 text-white"
                : "hover:bg-red-50 hover:border-red-300",
            )}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional: what worked, what didn't?"
        className="mt-2 min-h-[60px] text-sm"
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={handleSend} disabled={submitting || !rating}>
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Sending…
            </>
          ) : (
            "Send feedback"
          )}
        </Button>
      </div>
    </div>
  );
}
