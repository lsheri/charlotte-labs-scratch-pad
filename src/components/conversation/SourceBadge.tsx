import { Badge } from "@/components/ui/badge";
import { Upload, Puzzle } from "lucide-react";

/**
 * Small badge that surfaces whether a thread was captured via the browser
 * extension or uploaded manually. Intended for thread detail views (admin +
 * participant). Not shown on list/index views — capture source is mainly a
 * backend categorization signal.
 *
 * `source` values come from `ai_conversations.source`:
 *   - "extension" (default for extension captures)
 *   - "manual"    (manual upload flow)
 *   - anything else falls back to "extension" styling
 */
export function SourceBadge({ source, className = "" }: { source?: string | null; className?: string }) {
  const isManual = source === "manual";
  return (
    <Badge variant="outline" className={`gap-1 ${className}`} title={isManual ? "Uploaded manually by participant" : "Captured by browser extension"}>
      {isManual ? <Upload className="h-3 w-3" /> : <Puzzle className="h-3 w-3" />}
      {isManual ? "Manual" : "Extension"}
    </Badge>
  );
}
