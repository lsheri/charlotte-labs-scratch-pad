import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  receiptId: string;
  activeKey: string;
  templateKeys: string[]; // unique list of tabs (existing renderings + active)
  labelFor?: (key: string) => string;
}

const PRETTY: Record<string, string> = {
  classic_fluency: "Academic Fluency",
  verification_risk: "Verification & Risk",
  study_gaps: "Study Gaps",
};

export function TemplateTabs({ receiptId, activeKey, templateKeys, labelFor }: Props) {
  const navigate = useNavigate();
  const label = (k: string) => labelFor?.(k) ?? PRETTY[k] ?? k;

  return (
    <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
      {templateKeys.map((key) => {
        const active = key === activeKey;
        return (
          <button
            key={key}
            type="button"
            onClick={() =>
              navigate({
                to: "/participant/receipts/$receiptId",
                params: { receiptId },
                search: { template: key },
              })
            }
            className={cn(
              "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition",
              active
                ? "border-[#0A2848] text-[#0A2848] font-medium"
                : "border-transparent text-muted-foreground hover:text-[#0A2848]",
            )}
          >
            {label(key)}
          </button>
        );
      })}
      <div className="ml-auto pl-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigate({
              to: "/participant/receipts/$receiptId",
              params: { receiptId },
              search: { template: undefined },
            })
          }
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Run another template
        </Button>
      </div>
    </div>
  );
}
