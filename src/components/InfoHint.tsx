import { Info } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const GLOSSARY = {
  thread:
    "A raw LLM conversation — one chat session with an AI tool, captured as-is.",
  receipt:
    "Raw conversations tied to a finished piece of work, with analysis laid over it — the evidence behind what you turned in.",
} as const;

export function InfoHint({
  text,
  className,
  label = "More info",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground/70 transition hover:text-foreground",
              className,
            )}
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
