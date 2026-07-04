import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  role: string;
  content: string;
  collapseThreshold?: number;
  showCopy?: boolean;
}

export function TurnBlock({ role, content, collapseThreshold = 600, showCopy = false }: Props) {
  const long = content.length > collapseThreshold;
  const [open, setOpen] = useState(!long);
  const display = open ? content : content.slice(0, collapseThreshold) + "…";

  return (
    <div className={`rounded-md border p-3 ${role === "user" ? "bg-muted/40" : "bg-background"}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {role} <span className="ml-2 font-normal normal-case">{content.length.toLocaleString()} chars</span>
        </span>
        {showCopy && (
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => { navigator.clipboard.writeText(content); toast.success("Copied"); }}
          >
            <Copy className="mr-1 h-3 w-3" />Copy
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm">{display}</p>
      {long && (
        <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs"
          onClick={() => setOpen(o => !o)}>
          {open
            ? <><ChevronDown className="mr-1 h-3 w-3" />Collapse</>
            : <><ChevronRight className="mr-1 h-3 w-3" />Show full message</>}
        </Button>
      )}
    </div>
  );
}
