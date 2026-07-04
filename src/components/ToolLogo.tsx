import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_LOGO_IMAGES } from "@/lib/toolLogos";

interface Props {
  tool: string;
  size?: number;
  className?: string;
}

export function ToolLogo({ tool, size = 24, className }: Props) {
  const key = (tool || "").toLowerCase().trim();
  const src = TOOL_LOGO_IMAGES[key];
  if (src) {
    return (
      <img
        src={src}
        alt={tool}
        className={cn("rounded-md object-cover shrink-0 border bg-background", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Bot className={cn("text-muted-foreground", className)} style={{ width: size, height: size }} />;
}
